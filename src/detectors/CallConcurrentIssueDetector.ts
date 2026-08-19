import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';
import { concludeCallIssue } from './IssueConclusion';

export const CallConcurrentIssueTypes = {
	/** Several participants of this call have the same issue open **at the same time**. */
	concurrentClientIssues: 'CONCURRENT_CLIENT_ISSUES',

	/** Those issues also *began* together — the signature of one shared event. */
	issueOnsetBurst: 'ISSUE_ONSET_BURST',
} as const;

export type CallConcurrentIssueDetectorConfig = {

	/**
	 * The issue types to watch. **Required, and must not be empty** — the detector subscribes to
	 * exactly these and sees nothing else.
	 */
	issueTypes: string[];

	/**
	 * Participants the call needs before a ratio means anything. Default `3`.
	 *
	 * In a 1:1 call "half the participants" is one person, which is a client problem and not a call
	 * problem — `2` effectively disables the ratio gate. Raise it for large-meeting products where you
	 * only care once a handful are affected.
	 */
	minClients: number;

	/**
	 * Distinct clients that must share the issue. Default `3`.
	 *
	 * The absolute floor under `affectedRatioThreshold`, so a small call cannot clear a ratio with two
	 * unlucky people. Sensible range `2`–`5`; `2` is the lowest that can still mean "more than one
	 * participant", which is the whole premise.
	 */
	minAffectedClients: number;

	/**
	 * Fraction of the call's participants that must share it, `0`–`1`. Default `0.5`.
	 *
	 * Typical `0.3`–`0.7`. Lower catches partial events — a subset on one SFU worker — at the cost of
	 * firing on a few coincidentally unhappy participants; `1` demands literally everyone, which real
	 * incidents rarely produce because someone always reconnects first.
	 */
	affectedRatioThreshold: number;

	/**
	 * Onsets falling within this span (ms) escalate the finding to `ISSUE_ONSET_BURST` — they did not
	 * just overlap, they started together. Default `2_000`.
	 *
	 * Bound this by your sampling period, not below it: onsets are only known as accurately as clients
	 * report them, so a window shorter than one sampling period can only fire by luck. Typical
	 * `1_000`–`5_000`. Wider makes the escalation meaningless, since unrelated issues drift into the
	 * same window.
	 */
	onsetBurstWindowInMs: number;

	/**
	 * Re-arm time per issue type (ms). Default `60_000`.
	 *
	 * A shared event is one incident, not one per tick. Too low and a persistent problem raises an
	 * issue every tick for as long as it lasts; too high and a genuinely new occurrence is swallowed
	 * by the previous one's cooldown. Typical `30_000`–`300_000`.
	 */
	cooldownMs: number;
};

/** What the detector currently knows about one issue type in this call. */
export type CallConcurrentIssueGroup = {
	type: string;
	issues: ActiveClientIssue[];
	clientIds: string[];
	affectedRatio: number;
	totalClients: number;

	/**
	 * Spread of the onsets, in **observer** time (ms) — `max(observedAt) - min(observedAt)`.
	 *
	 * Measured on the observer clock on purpose: `raisedAt` comes from each client's own clock, and
	 * comparing those across machines makes clock skew look like a shared event.
	 */
	onsetSpreadInMs: number;
	firstObservedAt: number;
};

/**
 * Answers **"is this meeting in trouble?"** — several participants of one call with the same issue
 * open simultaneously.
 *
 * The client already decides *what* is wrong for itself — `congestion`, `ice-disconnected`,
 * `audio-concealment`, `video-decoder-overloaded` — with hysteresis and multi-signal confirmation
 * behind each verdict. Re-deriving those server-side from raw counters would be strictly worse. What
 * the server uniquely knows is *how many other participants of the same call are in that state right
 * now*, which is the difference between "one person's Wi-Fi" and "this room is broken".
 *
 * Concurrency is judged from the **open interval set**, not a window of recent reports. A window has
 * to guess whether a symptom is still happening; an interval is closed by the client when the episode
 * actually ends (client-monitor-js >= 4.6.0 ships the `<type>-resolved` companion for exactly this).
 *
 * ```ts
 * observedCall.addDetector('call-concurrent-issue-detector', {
 *   issueTypes: [ 'congestion', 'ice-disconnected' ],
 * });
 * ```
 *
 * For the cross-call version of this question — which is a different question, not this one with a
 * bigger denominator — see `ObserverConcurrentIssueDetector`.
 */
export class CallConcurrentIssueDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'call-concurrent-issue-detector' as const;

	public readonly name = CallConcurrentIssueDetector.NAME;

	private readonly _config: CallConcurrentIssueDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();

	/** issue type -> the issues of that type currently open in this call. */
	private readonly _byType = new Map<string, Set<ActiveClientIssue>>();
	private _size = 0;

	/** The groups that qualified on the most recent `update()`. Exposed for tests/dashboards. */
	public lastGroups: CallConcurrentIssueGroup[] = [];

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<CallConcurrentIssueDetectorConfig> = {},
	) {
		this._config = {
			issueTypes: [],
			minClients: 3,
			minAffectedClients: 3,
			affectedRatioThreshold: 0.5,
			onsetBurstWindowInMs: 2_000,
			cooldownMs: 60_000,
			...config,
		};

		for (const type of this._config.issueTypes) {
			this._call.activeIssuesRegistry.addIssueTracker(type, this);
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

		// Nothing subscribed is open: the overwhelmingly common case, and it costs one check.
		if (this._size === 0) return;

		const now = Date.now();
		const totalClients = this._call.observedClients.size;

		if (totalClients < this._config.minClients) return;

		for (const [ type, issues ] of this._byType) {
			const group = this._groupOf(type, issues, totalClients);

			if (group.clientIds.length < this._config.minAffectedClients) continue;
			if (group.affectedRatio < this._config.affectedRatioThreshold) continue;

			this.lastGroups.push(group);

			if (now - (this._lastRaisedAt.get(type) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(type, now);

			const burst = group.onsetSpreadInMs <= this._config.onsetBurstWindowInMs;
			const issueType = burst
				? CallConcurrentIssueTypes.issueOnsetBurst
				: CallConcurrentIssueTypes.concurrentClientIssues;
			// The interpretation step: what this spread implies, stated once here rather than left to
			// whoever reads the alert.
			const conclusion = concludeCallIssue({
				issueType: type,
				affectedClients: group.clientIds.length,
				totalClients: group.totalClients,
				onsetBurst: burst,
			});

			this._call.addIssue({
				type: issueType,
				timestamp: now,
				conclusion,
				payload: {
					issueType: type,
					clients: group.totalClients,
					affectedClients: group.clientIds.length,
					affectedRatio: group.affectedRatio,
					affectedClientIds: group.clientIds,
					onsetSpreadInMs: group.onsetSpreadInMs,
					onsetBurst: burst,
					firstObservedAt: group.firstObservedAt,
				},
			});
		}
	}

	public close(): void {
		this._call.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	private _groupOf(type: string, issues: Set<ActiveClientIssue>, totalClients: number): CallConcurrentIssueGroup {
		// One pass, accumulating everything. `Math.min(...array)` on a spread would allocate and can
		// blow the stack on large groups, so the onsets are tracked here instead.
		const clientIds = new Set<string>();
		const list: ActiveClientIssue[] = [];
		let earliest = Infinity;
		let latest = -Infinity;

		for (const issue of issues) {
			list.push(issue);
			// One client can hold several issues of a type (one per track); the unit is the client, so
			// the ratio can never exceed 1.
			clientIds.add(issue.clientId);

			if (issue.observedAt < earliest) earliest = issue.observedAt;
			if (latest < issue.observedAt) latest = issue.observedAt;
		}

		return {
			type,
			issues: list,
			clientIds: [ ...clientIds ],
			totalClients,
			affectedRatio: 0 < totalClients ? clientIds.size / totalClients : 0,
			onsetSpreadInMs: latest - earliest,
			firstObservedAt: earliest,
		};
	}
}
