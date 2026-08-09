import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { Observer } from '../Observer';
import { IssueCohort, IssueRegistry, IssueRegistryConfig } from '../utils/IssueRegistry';

export const ConcurrentIssueTypes = {
	/** Several participants have the same issue open **at the same time**. */
	concurrentClientIssues: 'CONCURRENT_CLIENT_ISSUES',

	/** Those issues also *began* together — the signature of one infrastructure event. */
	issueOnsetBurst: 'ISSUE_ONSET_BURST',
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

	/** Fraction of participants that must share it. Default `0.5`. */
	affectedRatioThreshold: number;

	/**
	 * When the onsets of a qualifying cohort fall within this span (ms), the finding is escalated to
	 * `ISSUE_ONSET_BURST` — they didn't just overlap, they started together. Default `2_000`.
	 */
	onsetBurstWindowInMs: number;

	/** Re-arm time (ms) per issue type. Default `60_000`. */
	cooldownMs: number;

	/** Forwarded to the {@link IssueRegistry} (stale-issue expiry). */
	registry?: Partial<IssueRegistryConfig>;
};

const defaultConfig: ConcurrentIssueDetectorConfig = {
	issueTypes: [],
	minClients: 3,
	minAffectedClients: 3,
	affectedRatioThreshold: 0.5,
	onsetBurstWindowInMs: 2_000,
	cooldownMs: 60_000,
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
 * Works at both scopes — pass an `ObservedCall` for "this meeting", or the `Observer` for
 * "everything this SFU is serving".
 */
export class ConcurrentIssueDetector implements Detector {
	public readonly name = 'concurrent-issue-detector';

	private readonly _config: ConcurrentIssueDetectorConfig;
	private readonly _registry: IssueRegistry;
	private readonly _lastRaisedAt = new Map<string, number>();
	private readonly _isObserverScope: boolean;

	/** The cohorts that qualified on the most recent `update()`. */
	public lastCohorts: IssueCohort[] = [];

	public constructor(
		private readonly _scope: ObservedCall | Observer,
		config: Partial<ConcurrentIssueDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._registry = new IssueRegistry(_scope, config.registry);
		this._isObserverScope = (_scope as Partial<Observer>).observedCalls !== undefined;
	}

	public update(): void {
		const now = Date.now();
		const wanted = new Set(this._config.issueTypes);
		const cohorts = this._registry.cohorts(now)
			.filter((cohort) => wanted.size === 0 || wanted.has(cohort.type));

		this.lastCohorts = [];

		if (this._registry.totalClients < this._config.minClients) return;

		for (const cohort of cohorts) {
			if (cohort.clientIds.length < this._config.minAffectedClients) continue;
			if (cohort.affectedRatio < this._config.affectedRatioThreshold) continue;

			this.lastCohorts.push(cohort);

			if (now - (this._lastRaisedAt.get(cohort.type) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(cohort.type, now);

			const burst = cohort.onsetSpreadInMs <= this._config.onsetBurstWindowInMs;
			const type = burst ? ConcurrentIssueTypes.issueOnsetBurst : ConcurrentIssueTypes.concurrentClientIssues;

			this._raise(type, {
				type,
				issueType: cohort.type,
				scope: this._isObserverScope ? 'observer' : 'call',
				clients: cohort.totalClients,
				affectedClients: cohort.clientIds.length,
				affectedRatio: cohort.affectedRatio,
				affectedClientIds: cohort.clientIds,
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
		this._scope.addIssue({ type, timestamp: now, payload: JSON.stringify(payload) });
	}
}
