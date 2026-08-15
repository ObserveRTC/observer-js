import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { Observer } from '../Observer';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';
import { ANY_ISSUE_TYPE } from '../issues/ActiveIssuesRegistry';
import { concludeFrom } from './IssueConclusion';

export const ConcurrentIssueTypes = {
	/** Several participants of one call have the same issue open **at the same time**. */
	concurrentClientIssues: 'CONCURRENT_CLIENT_ISSUES',

	/** Those issues also *began* together — the signature of one shared event. */
	issueOnsetBurst: 'ISSUE_ONSET_BURST',

	/**
	 * Observer scope only: the same issue is open in **several unrelated calls at once**. Those
	 * clients share no meeting, no publisher and no room — only the infrastructure serving them.
	 */
	crossCallConcurrentIssues: 'CROSS_CALL_CONCURRENT_ISSUES',

	/** The cross-call version that also started together. The strongest "it's us" signal available. */
	crossCallIssueOnsetBurst: 'CROSS_CALL_ISSUE_ONSET_BURST',
} as const;

export type ConcurrentIssueDetectorConfig = {

	/**
	 * Only consider these issue types. Empty (default) means every type the clients report — which is
	 * usually what you want, since the detector is generic over the client's vocabulary.
	 */
	issueTypes: string[];

	/** Minimum participants in scope before a ratio is meaningful. Default `3`. */
	minClients: number;

	/** Minimum distinct clients sharing the open issue. Default `3`. */
	minAffectedClients: number;

	/**
	 * Fraction of participants that must share it. Default `0.5`.
	 *
	 * **Call scope only.** At observer scope the gate is call spread instead — a fleet-wide event
	 * typically affects a small share of all clients, so a participant ratio would suppress it.
	 */
	affectedRatioThreshold: number;

	/**
	 * **Observer scope only.** Minimum number of *distinct calls* the affected clients must span.
	 * Default `2`.
	 *
	 * This is what makes an observer-scoped finding mean something a call-scoped one doesn't. Without
	 * it, one thirty-person meeting with congestion satisfies every client-count threshold and raises
	 * a fleet-wide alert for what is really one bad room — and the call-scoped detector has already
	 * reported it. Requiring two or more independent calls is the difference between a coincidence
	 * and a shared cause.
	 *
	 * Set to `1` to have the observer scope report single-call cohorts too (expect duplicates
	 * alongside the call-scoped detector). Ignored entirely at call scope.
	 */
	minAffectedCalls: number;

	/**
	 * **Observer scope only.** Fraction of the calls in flight that must be affected. Default `0` —
	 * off, because absolute counts matter more than ratios here: three broken calls out of a thousand
	 * is still worth knowing about, and a ratio threshold would hide it.
	 */
	affectedCallRatioThreshold: number;

	/**
	 * When the onsets of a qualifying group fall within this span (ms), the finding is escalated to
	 * `ISSUE_ONSET_BURST` — they didn't just overlap, they started together. Default `2_000`.
	 */
	onsetBurstWindowInMs: number;

	/** Re-arm time (ms) per issue type. Default `60_000`. */
	cooldownMs: number;
};

/** What the detector currently knows about one issue type. Rebuilt only when that type changes. */
export type ConcurrentIssueGroup = {
	type: string;
	issues: ActiveClientIssue[];
	clientIds: string[];
	affectedRatio: number;
	totalClients: number;
	callIds: string[];
	totalCalls: number;
	affectedCallRatio: number;
	perCall: { callId: string, affectedClients: number, totalClients: number }[];

	/**
	 * Spread of the onsets, in **observer** time (ms) — `max(observedAt) - min(observedAt)`.
	 *
	 * Measured on the observer clock on purpose: `raisedAt` comes from each client's own clock, and
	 * comparing those across machines makes clock skew look like an infrastructure event.
	 */
	onsetSpreadInMs: number;
	firstObservedAt: number;
};

/**
 * Raises a finding when **several participants have the same issue open simultaneously**.
 *
 * This is the generic replacement for a family of symptom-specific detectors. The client already
 * decides *what* is wrong for itself — `congestion`, `ice-disconnected`, `audio-concealment`,
 * `video-decoder-overloaded`, and so on — with detectors that have hysteresis and multi-signal
 * confirmation behind them. Re-deriving those verdicts from raw counters server-side would be
 * strictly worse. What the server uniquely knows is *how many other participants are in the same
 * state right now*, which is exactly the difference between "one person's Wi-Fi" and "our problem".
 *
 * Concurrency is judged from the **open interval set**, not from a sliding window of recent reports.
 * A window has to guess whether a symptom is still happening; an interval is closed by the client
 * when the episode actually ends (client-monitor-js >= 4.6.0 ships the `<type>-resolved` companion
 * for this purpose).
 *
 * ### It is fed, not polled
 *
 * The detector registers itself as an {@link ActiveIssueTracker} on the registry of its scope, so
 * issues arrive as they open and close and it keeps them bucketed by type. `update()` then reads
 * buckets it already has instead of walking every client — a call where nothing is wrong costs one
 * `size === 0` check per tick, whatever its participant count.
 *
 * ### The two scopes ask different questions
 *
 * Pass an `ObservedCall` for *"is this meeting in trouble?"*, or the `Observer` for *"is our
 * infrastructure in trouble?"*. They are not the same question with a bigger denominator.
 *
 * At **observer** scope the group must span at least `minAffectedCalls` distinct calls before
 * anything is raised, and the finding uses its own types (`CROSS_CALL_*`). Participant count alone
 * is a bad fleet signal: one thirty-person meeting where everybody is congested clears every client
 * threshold, yet it has an obvious local explanation and the call-scoped detector has already
 * reported it. Clients in *different* calls share no room, no publisher and no host — only the
 * servers, so when the same issue opens across several of them at once, the infrastructure is the
 * only remaining common factor:
 *
 * ```ts
 * observer.on('observer-issue', ({ issue }) => {
 *   if (issue.type === ConcurrentIssueTypes.crossCallIssueOnsetBurst) page(issue);
 * });
 * // → CROSS_CALL_ISSUE_ONSET_BURST { issueType: 'congestion', calls: 40, affectedCalls: 6, … }
 * ```
 */
export class ConcurrentIssueDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'concurrent-issue-detector';

	public readonly name = ConcurrentIssueDetector.NAME;

	private readonly _config: ConcurrentIssueDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();
	private readonly _isObserverScope: boolean;

	/** issue type -> the issues of that type currently open in this scope. */
	private readonly _byType = new Map<string, Set<ActiveClientIssue>>();
	private _size = 0;

	/** The groups that qualified on the most recent `update()`. Exposed for tests/dashboards. */
	public lastGroups: ConcurrentIssueGroup[] = [];

	public constructor(
		private readonly _scope: ObservedCall | Observer,
		config: Partial<ConcurrentIssueDetectorConfig> = {},
	) {
		this._config = {
			issueTypes: [],
			minClients: 3,
			minAffectedClients: 3,
			affectedRatioThreshold: 0.5,
			minAffectedCalls: 2,
			affectedCallRatioThreshold: 0,
			onsetBurstWindowInMs: 2_000,
			cooldownMs: 60_000,
			...config,
		};
		// Discriminated by shape rather than `instanceof`, to avoid a circular import between the
		// entity classes and this module.
		this._isObserverScope = (_scope as Partial<Observer>).observedCalls !== undefined;

		// An empty `issueTypes` means "whatever the clients report", which is a wildcard subscription
		// rather than a filter applied later — the registry never hands us anything we then discard.
		const subscribeTo = 0 < this._config.issueTypes.length ? this._config.issueTypes : [ ANY_ISSUE_TYPE ];

		for (const type of subscribeTo) {
			this._scope.activeIssuesRegistry.addIssueTracker(type, this);
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
		// Drop the empty bucket, so a long call doesn't retain one map entry per issue type ever seen.
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

		// Nothing is open anywhere in scope: the overwhelmingly common case, and it costs one check.
		if (this._size === 0) return;

		const now = Date.now();
		const totalClients = this._totalClients();

		if (totalClients < this._config.minClients) return;

		for (const [ type, issues ] of this._byType) {
			const group = this._groupOf(type, issues, totalClients);

			if (group.clientIds.length < this._config.minAffectedClients) continue;

			if (this._isObserverScope) {
				// At observer scope the gate is *call spread*, not participant share — see the class
				// description. `affectedRatioThreshold` is deliberately NOT applied here: six broken
				// calls out of forty is a handful of clients against the whole fleet, so any
				// meaningful participant ratio would suppress exactly the finding we want.
				if (group.callIds.length < this._config.minAffectedCalls) continue;
				if (group.affectedCallRatio < this._config.affectedCallRatioThreshold) continue;
			} else if (group.affectedRatio < this._config.affectedRatioThreshold) continue;

			this.lastGroups.push(group);

			if (now - (this._lastRaisedAt.get(type) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(type, now);

			const burst = group.onsetSpreadInMs <= this._config.onsetBurstWindowInMs;
			const issueType = this._isObserverScope
				? (burst ? ConcurrentIssueTypes.crossCallIssueOnsetBurst : ConcurrentIssueTypes.crossCallConcurrentIssues)
				: (burst ? ConcurrentIssueTypes.issueOnsetBurst : ConcurrentIssueTypes.concurrentClientIssues);
			const scope = this._isObserverScope ? 'observer' as const : 'call' as const;
			// The interpretation step: what this spread implies, stated once here rather than left to
			// whoever reads the alert.
			const conclusion = concludeFrom({
				issueType: type,
				scope,
				affectedClients: group.clientIds.length,
				totalClients: group.totalClients,
				affectedCalls: group.callIds.length,
				totalCalls: group.totalCalls,
				onsetBurst: burst,
			});

			this._scope.addIssue({
				type: issueType,
				timestamp: now,
				payload: {
					type: issueType,
					issueType: type,
					scope,
					conclusion,
					clients: group.totalClients,
					affectedClients: group.clientIds.length,
					affectedRatio: group.affectedRatio,
					affectedClientIds: group.clientIds,
					// The call dimension. Meaningless at call scope (always one), decisive at observer scope.
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
		this._scope.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	private _totalClients(): number {
		return this._isObserverScope
			? (this._scope as Observer).numberOfClients
			: (this._scope as ObservedCall).observedClients.size;
	}

	private _totalCalls(): number {
		return this._isObserverScope ? (this._scope as Observer).observedCalls.size : 1;
	}

	private _clientsInCall(callId: string): number | undefined {
		if (!this._isObserverScope) {
			const call = this._scope as ObservedCall;

			return call.callId === callId ? call.observedClients.size : undefined;
		}

		return (this._scope as Observer).observedCalls.get(callId)?.observedClients.size;
	}

	private _groupOf(type: string, issues: Set<ActiveClientIssue>, totalClients: number): ConcurrentIssueGroup {
		// One pass, accumulating everything. `Math.min(...array)` on a spread would allocate and can
		// blow the stack on large groups, so the onsets are tracked here instead.
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

		const totalCalls = this._totalCalls();
		const perCall: ConcurrentIssueGroup['perCall'] = [];

		for (const [ callId, clients ] of affectedByCall) {
			perCall.push({
				callId,
				affectedClients: clients.size,
				totalClients: this._clientsInCall(callId) ?? clients.size,
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
