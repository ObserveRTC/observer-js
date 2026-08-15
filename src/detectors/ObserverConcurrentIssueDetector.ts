import type { Detector } from './Detector';
import type { Observer } from '../Observer';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';
import { concludeObserverIssue } from './IssueConclusion';

export const ObserverConcurrentIssueTypes = {
	/**
	 * The same issue is open in **several unrelated calls at once**. Those clients share no meeting,
	 * no publisher and no room — only the infrastructure serving them.
	 */
	crossCallConcurrentIssues: 'CROSS_CALL_CONCURRENT_ISSUES',

	/** The cross-call version that also started together. The strongest "it's us" signal available. */
	crossCallIssueOnsetBurst: 'CROSS_CALL_ISSUE_ONSET_BURST',
} as const;

export type ObserverConcurrentIssueDetectorConfig = {

	/**
	 * The issue types to watch. **Required, and must not be empty** — the detector subscribes to
	 * exactly these and sees nothing else.
	 */
	issueTypes: string[];

	/** Minimum distinct clients sharing the open issue. Default `3`. */
	minAffectedClients: number;

	/**
	 * Minimum number of *distinct calls* the affected clients must span. Default `2`.
	 *
	 * This is what makes an observer-scoped finding mean something a call-scoped one doesn't. Without
	 * it, one thirty-person meeting with congestion satisfies every client-count threshold and raises
	 * a fleet-wide alert for what is really one bad room — which `CallConcurrentIssueDetector` has
	 * already reported. Requiring two or more independent calls is the difference between a
	 * coincidence and a shared cause.
	 */
	minAffectedCalls: number;

	/**
	 * Fraction of the calls in flight that must be affected. Default `0` — off, because absolute
	 * counts matter more than ratios here: three broken calls out of a thousand is still worth
	 * knowing about, and a ratio threshold would hide it. Raise it if you only care about fleet-wide
	 * events.
	 *
	 * Note there is deliberately **no participant ratio** at this scope. Six broken calls out of forty
	 * is a handful of clients against the whole fleet, so any meaningful client ratio would suppress
	 * exactly the finding this detector exists to produce.
	 */
	affectedCallRatioThreshold: number;

	/**
	 * When the onsets fall within this span (ms), the finding is escalated to
	 * `CROSS_CALL_ISSUE_ONSET_BURST`. Default `2_000`.
	 */
	onsetBurstWindowInMs: number;

	/** Re-arm time (ms) per issue type. Default `60_000`. */
	cooldownMs: number;
};

/** What the detector currently knows about one issue type across the fleet. */
export type ObserverConcurrentIssueGroup = {
	type: string;
	issues: ActiveClientIssue[];
	clientIds: string[];
	totalClients: number;
	affectedRatio: number;
	callIds: string[];
	totalCalls: number;
	affectedCallRatio: number;

	/** Per-call breakdown, largest first — the first question anyone asks is "which calls, how badly?". */
	perCall: { callId: string, affectedClients: number, totalClients: number }[];

	/**
	 * Spread of the onsets, in **observer** time (ms). Client clocks are never compared across
	 * machines here — skew between them would masquerade as a synchronized event.
	 */
	onsetSpreadInMs: number;
	firstObservedAt: number;
};

/**
 * Answers **"is our infrastructure in trouble?"** — the same issue open across several *unrelated*
 * calls at the same moment.
 *
 * This is not the call-scoped question with a bigger denominator, which is why it is a separate
 * detector with separate gates and its own finding types. Participant count alone is a bad fleet
 * signal: one thirty-person meeting where everybody is congested clears every client threshold, yet
 * it has an obvious local explanation. Clients in *different* calls share no room, no publisher and
 * no host — only the servers and the network. When the same issue opens across several of them at
 * once, the infrastructure is the only remaining common factor, and that is the finding worth paging
 * someone about.
 *
 * ```ts
 * observer.addObserverDetector('observer-concurrent-issue-detector', {
 *   issueTypes: [ 'congestion', 'ice-disconnected' ],
 *   minAffectedCalls: 3,
 * });
 *
 * observer.on('observer-issue', ({ issue }) => {
 *   if (issue.type === ObserverConcurrentIssueTypes.crossCallIssueOnsetBurst) page(issue);
 * });
 * // → CROSS_CALL_ISSUE_ONSET_BURST { issueType: 'congestion', calls: 40, affectedCalls: 6, … }
 * ```
 *
 * Onsets are compared on the **observer clock** (`observedAt`), never on client clocks: participants
 * degrading together within a couple of seconds is far more likely to be a deploy, a TURN failover or
 * a link flap than a coincidence — but only if the timestamps being compared came from one clock.
 */
export class ObserverConcurrentIssueDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'observer-concurrent-issue-detector' as const;

	public readonly name = ObserverConcurrentIssueDetector.NAME;

	private readonly _config: ObserverConcurrentIssueDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();

	/** issue type -> the issues of that type currently open anywhere in the fleet. */
	private readonly _byType = new Map<string, Set<ActiveClientIssue>>();
	private _size = 0;

	/** The groups that qualified on the most recent `update()`. Exposed for tests/dashboards. */
	public lastGroups: ObserverConcurrentIssueGroup[] = [];

	public constructor(
		private readonly _observer: Observer,
		config: Partial<ObserverConcurrentIssueDetectorConfig> = {},
	) {
		this._config = {
			issueTypes: [],
			minAffectedClients: 3,
			minAffectedCalls: 2,
			affectedCallRatioThreshold: 0,
			onsetBurstWindowInMs: 2_000,
			cooldownMs: 60_000,
			...config,
		};

		for (const type of this._config.issueTypes) {
			this._observer.activeIssuesRegistry.addIssueTracker(type, this);
		}
	}

	public get size(): number {
		return this._size;
	}

	public has(issue: ActiveClientIssue): boolean {
		return this._byType.get(issue.type)?.has(issue) ?? false;
	}

	public add(issue: ActiveClientIssue): void {
		let bucket = this._byType.get(issue.type);

		if (!bucket) {
			bucket = new Set();
			this._byType.set(issue.type, bucket);
		}
		if (bucket.has(issue)) return;

		bucket.add(issue);
		++this._size;
	}

	public delete(issue: ActiveClientIssue): boolean {
		const bucket = this._byType.get(issue.type);

		if (!bucket?.delete(issue)) return false;

		--this._size;
		if (bucket.size === 0) this._byType.delete(issue.type);

		return true;
	}

	public clear(): void {
		this._byType.clear();
		this._size = 0;
		this.lastGroups = [];
	}

	public update(): void {
		this.lastGroups = [];

		if (this._size === 0) return;

		const now = Date.now();

		for (const [ type, issues ] of this._byType) {
			const group = this._groupOf(type, issues);

			if (group.clientIds.length < this._config.minAffectedClients) continue;
			if (group.callIds.length < this._config.minAffectedCalls) continue;
			if (group.affectedCallRatio < this._config.affectedCallRatioThreshold) continue;

			this.lastGroups.push(group);

			if (now - (this._lastRaisedAt.get(type) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(type, now);

			const burst = group.onsetSpreadInMs <= this._config.onsetBurstWindowInMs;
			const issueType = burst
				? ObserverConcurrentIssueTypes.crossCallIssueOnsetBurst
				: ObserverConcurrentIssueTypes.crossCallConcurrentIssues;
			const conclusion = concludeObserverIssue({
				issueType: type,
				affectedClients: group.clientIds.length,
				totalClients: group.totalClients,
				affectedCalls: group.callIds.length,
				totalCalls: group.totalCalls,
				onsetBurst: burst,
			});

			this._observer.addIssue({
				type: issueType,
				timestamp: now,
				payload: {
					type: issueType,
					issueType: type,
					scope: 'observer',
					conclusion,
					clients: group.totalClients,
					affectedClients: group.clientIds.length,
					affectedRatio: group.affectedRatio,
					affectedClientIds: group.clientIds,
					// The dimension that makes this finding what it is.
					calls: group.totalCalls,
					affectedCalls: group.callIds.length,
					affectedCallRatio: group.affectedCallRatio,
					affectedCallIds: group.callIds,
					perCall: group.perCall,
					onsetSpreadInMs: group.onsetSpreadInMs,
					onsetBurst: burst,
					firstObservedAt: group.firstObservedAt,
				},
			});
		}
	}

	public close(): void {
		this._observer.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	private _groupOf(type: string, issues: Set<ActiveClientIssue>): ObserverConcurrentIssueGroup {
		const clientIds = new Set<string>();
		const affectedByCall = new Map<string, Set<string>>();
		const list: ActiveClientIssue[] = [];
		let earliest = Infinity;
		let latest = -Infinity;

		for (const issue of issues) {
			list.push(issue);
			clientIds.add(issue.clientId);

			let clients = affectedByCall.get(issue.callId);

			if (!clients) {
				clients = new Set();
				affectedByCall.set(issue.callId, clients);
			}
			clients.add(issue.clientId);

			if (issue.observedAt < earliest) earliest = issue.observedAt;
			if (latest < issue.observedAt) latest = issue.observedAt;
		}

		const totalClients = this._observer.numberOfClients;
		const totalCalls = this._observer.observedCalls.size;
		const perCall: ObserverConcurrentIssueGroup['perCall'] = [];

		for (const [ callId, clients ] of affectedByCall) {
			perCall.push({
				callId,
				affectedClients: clients.size,
				// A call that closed while its issues were still open has no participant count left;
				// fall back to the affected count rather than reporting a 0 denominator.
				totalClients: this._observer.observedCalls.get(callId)?.observedClients.size ?? clients.size,
			});
		}
		perCall.sort((a, b) => b.affectedClients - a.affectedClients);

		return {
			type,
			issues: list,
			clientIds: [ ...clientIds ],
			totalClients,
			affectedRatio: 0 < totalClients ? clientIds.size / totalClients : 0,
			callIds: perCall.map((entry) => entry.callId),
			totalCalls,
			affectedCallRatio: 0 < totalCalls ? perCall.length / totalCalls : 0,
			perCall,
			onsetSpreadInMs: latest - earliest,
			firstObservedAt: earliest,
		};
	}
}
