import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { Observer } from '../Observer';
import type { IssueCohort } from '../utils/IssueIndex';
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
	 * Only consider these issue types. Empty (default) means every type the clients report — which
	 * is usually what you want, since the detector is generic over the client's vocabulary.
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
	 * is still worth knowing about, and a ratio threshold would hide it. Raise it if you only care
	 * about fleet-wide events.
	 */
	affectedCallRatioThreshold: number;

	/**
	 * When the onsets of a qualifying cohort fall within this span (ms), the finding is escalated to
	 * `ISSUE_ONSET_BURST` — they didn't just overlap, they started together. Default `2_000`.
	 */
	onsetBurstWindowInMs: number;

	/** Re-arm time (ms) per issue type. Default `60_000`. */
	cooldownMs: number;

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
 * Concurrency is judged from the **active issue set** (open interval per key), not from a sliding
 * window of recent reports. That distinction matters: a window has to guess whether a symptom is
 * still happening, whereas an interval is closed by the client when the episode actually ends
 * (client-monitor-js >= 4.6.0 ships the `<type>-resolved` companion for this purpose).
 *
 * When the onsets also cluster inside `onsetBurstWindowInMs`, the finding is escalated to
 * `ISSUE_ONSET_BURST`: participants degrading *together within a couple of seconds* is far more
 * likely to be a deploy, a TURN failover or a link flap than a coincidence. Onsets are compared on
 * the **observer clock** (`observedAt`), never on client clocks, because clock skew between
 * machines would otherwise masquerade as a synchronized event.
 *
 * ### The two scopes ask different questions
 *
 * Pass an `ObservedCall` for *"is this meeting in trouble?"*, or the `Observer` for *"is our
 * infrastructure in trouble?"*. They are not the same question with a bigger denominator, and the
 * detector does not treat them that way.
 *
 * At **observer** scope the cohort must span at least `minAffectedCalls` distinct calls before
 * anything is raised, and the finding uses its own types (`CROSS_CALL_*`). The reason is that
 * participant count alone is a bad fleet signal: one thirty-person meeting where everybody is
 * congested clears every client threshold, yet it has an obvious local explanation and the
 * call-scoped detector has already reported it. Clients in *different* calls share no room, no
 * publisher and no host — only the servers, so when the same issue opens across several of them
 * simultaneously, the infrastructure is the only remaining common factor. That is the finding worth
 * paging someone about:
 *
 * ```ts
 * observer.on('observer-issue', ({ issue }) => {
 *   if (issue.type === ConcurrentIssueTypes.crossCallIssueOnsetBurst) page(issue);
 * });
 * // → CROSS_CALL_ISSUE_ONSET_BURST { issueType: 'congestion', calls: 40, affectedCalls: 6, … }
 * ```
 *
 * The payload carries a `perCall` breakdown, because the first question anyone asks on receiving one
 * of these is "which calls, and how badly?".
 */
export class ConcurrentIssueDetector implements Detector {
	public readonly name = 'concurrent-issue-detector';

	private readonly _config: ConcurrentIssueDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();
	private readonly _isObserverScope: boolean;

	/** The cohorts that qualified on the most recent `update()`. */
	public lastCohorts: IssueCohort[] = [];

	public constructor(
		private readonly _scope: ObservedCall | Observer,
		config: ConcurrentIssueDetectorConfig,
	) {
		this._config = config;
		this._isObserverScope = (_scope as Partial<Observer>).observedCalls !== undefined;
	}

	public update(): void {
		const now = Date.now();
		const wanted = new Set(this._config.issueTypes);
		const index = this._scope.issueIndex;
		const cohorts = index.cohorts()
			.filter((cohort) => wanted.size === 0 || wanted.has(cohort.type));

		this.lastCohorts = [];

		if (index.totalClients < this._config.minClients) return;

		for (const cohort of cohorts) {
			if (cohort.clientIds.length < this._config.minAffectedClients) continue;

			if (this._isObserverScope) {
				// At observer scope the gate is *call spread*, not participant share — see the class
				// description. `affectedRatioThreshold` is deliberately NOT applied here: six broken
				// calls out of forty is a handful of clients against the whole fleet, so any
				// meaningful participant ratio would suppress exactly the finding we want.
				if (cohort.callIds.length < this._config.minAffectedCalls) continue;
				if (cohort.affectedCallRatio < this._config.affectedCallRatioThreshold) continue;
			} else if (cohort.affectedRatio < this._config.affectedRatioThreshold) continue;

			this.lastCohorts.push(cohort);

			if (now - (this._lastRaisedAt.get(cohort.type) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(cohort.type, now);

			const burst = cohort.onsetSpreadInMs <= this._config.onsetBurstWindowInMs;
			const type = this._isObserverScope
				? (burst ? ConcurrentIssueTypes.crossCallIssueOnsetBurst : ConcurrentIssueTypes.crossCallConcurrentIssues)
				: (burst ? ConcurrentIssueTypes.issueOnsetBurst : ConcurrentIssueTypes.concurrentClientIssues);
			const scope = this._isObserverScope ? 'observer' as const : 'call' as const;
			// The interpretation step: what this spread implies, stated once here rather than left to
			// whoever reads the alert.
			const conclusion = concludeFrom({
				issueType: cohort.type,
				scope,
				affectedClients: cohort.clientIds.length,
				totalClients: cohort.totalClients,
				affectedCalls: cohort.callIds.length,
				totalCalls: cohort.totalCalls,
				onsetBurst: burst,
			});

			this._raise(type, {
				type,
				issueType: cohort.type,
				scope,
				conclusion,
				clients: cohort.totalClients,
				affectedClients: cohort.clientIds.length,
				affectedRatio: cohort.affectedRatio,
				affectedClientIds: cohort.clientIds,
				// The call dimension. Meaningless at call scope (always one), decisive at observer scope.
				calls: cohort.totalCalls,
				affectedCalls: cohort.callIds.length,
				affectedCallRatio: cohort.affectedCallRatio,
				affectedCallIds: cohort.callIds,
				perCall: cohort.perCall,
				onsetSpreadInMs: cohort.onsetSpreadInMs,
				onsetBurst: burst,
				firstObservedAt: cohort.firstObservedAt,
			}, now);
		}
	}

	public close(): void {
		this._lastRaisedAt.clear();
		this.lastCohorts = [];
	}

	private _raise(type: string, payload: Record<string, unknown>, now: number) {
		this._scope.addIssue({ type, timestamp: now, payload });
	}
}
