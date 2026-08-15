import { Detector, Observer } from '..';
import { median, robustZScore } from '../utils/stats';
import { ActiveClientIssue } from '../issues/ActiveClientIssue';
import { ActiveIssueTracker } from '../issues/ActiveIssueTracker';

/**
 * One completed sampling bucket: how many/which clients reported congestion during it.
 *
 * `totalClients` (and therefore `congestedClientRatio`) is a snapshot of `observer.numberOfClients`
 * taken when the bucket closes — an approximation of "how many clients could have been congested",
 * not a claim that every client sent exactly one sample within the bucket. Good enough for a ratio
 * that only needs to be comparable bucket-to-bucket.
 */
export type SfuCongestionDetectorBucket = {
	observedAt: number;
	totalClients: number;
	congestedClients: number;
	congestedClientRatio: number;
	affectedClientIds: string[];
	affectedCallIds: string[];
};

export type SfuCongestionDetectorReport = {
	affectedCallIds: string[];
	affectedClientIds: string[];
	congestedClientRatio: number;
	totalNumberOfClients: number;
	numberOfCongestedClients: number;
	// the number of completed buckets kept in history at the time of detection
	historySize: number;
	// diagnostics: the baseline this bucket was judged against, and by how much it cleared it
	baselineCongestedClientRatio: number;
	robustZ: number;
	absoluteIncrease: number;
	relativeIncrease: number;
}

export type SfuCongestionDetectorConfig = {
	// the client-issue types that, when raised, are considered "congestion" for this indicator
	consumedClientIssueTypes: string[];
	// the type the observer-issue would be raised with, if/when this indicator is wired to emit one
	emittedObserverIssueType: string;

	// the duration the client takes to send a sample; samplesSendingTimeInMs * 2 is the bucket
	// duration, so every client gets a fair chance to report within one bucket
	samplesSendingTimeInMs: number;

	// how many completed buckets to keep as history (the candidate bucket plus its baseline)
	historySize: number;

	// no statistical judgement is made until at least this many buckets (baseline + candidate) exist
	minHistorySize: number;

	// the minimum number of distinct clients that must be congested in the candidate bucket
	minAffectedClients: number;

	// the candidate's congested-client ratio must clear the baseline median by at least this much
	minAbsoluteRatioIncrease: number;

	// the candidate's congested-client ratio must be at least this many times the baseline median
	minRelativeRatioIncrease: number;

	// the candidate's robust z-score (median + MAD baseline) must be at least this high
	robustZThreshold: number;
}

/** The statistical/practical-significance verdict for one candidate bucket against its baseline. */
export type SfuCongestionDetectorEvaluation = {
	isCongested: boolean;
	baselineCongestedClientRatio: number;
	robustZ: number;
	absoluteIncrease: number;
	relativeIncrease: number;
};

// this should only be added if one observer manages only calls from one SFU
// if the observer manages all or a set of calls from the SAME SFU, then this indicator is useful to
// add, becasue it detects if congestion is reported by multiple clients across different calls at
// the same time, which is a strong indication of a real, shared congestion event rather than a
// client-side issue.
export class SfuCongestionDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'sfu-congestion-detector';

	public readonly name = SfuCongestionDetector.NAME;

	private readonly _config: SfuCongestionDetectorConfig;
	private readonly _history: SfuCongestionDetectorBucket[] = [];
	private readonly _trackedIssues = new Set<ActiveClientIssue>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private _lastEvaluatedBucket: SfuCongestionDetectorBucket | undefined;

	public constructor(
		private readonly _observer: Observer,
		config: Partial<SfuCongestionDetectorConfig> = {},
	) {
		this._config = {
			consumedClientIssueTypes: [
				'congestion'
			],
			emittedObserverIssueType: 'sfu-congestion',
			samplesSendingTimeInMs: 10_000,
			historySize: 30,
			minHistorySize: 5,
			minAffectedClients: 3,
			minAbsoluteRatioIncrease: 0.05,
			minRelativeRatioIncrease: 2,
			robustZThreshold: 3,
			...config,
		};

		for (const issueType of this._config.consumedClientIssueTypes) {
			this._observer.activeIssuesRegistry.addIssueTracker(issueType, this);
		}

		this.timer = setInterval(() => {
			this._closeBucket(Date.now());
			this._evaluateLatestBucket();
		}, this._config.samplesSendingTimeInMs);
	}
	public get size() {
		return this._trackedIssues.size;
	}

	/**
	 * Track the issue for the current bucket, and close the bucket once the span between the first
	 * and the last tracked issue reaches `samplesSendingTimeInMs * 2` — bucket timing is driven by
	 * the issues themselves (not the wall clock), so a bucket only closes once congestion is actually
	 * being reported.
	 */
	public add(issue: ActiveClientIssue): void {
		this._trackedIssues.add(issue);
	}

	public delete(issue: ActiveClientIssue): boolean {
		// we are not interested in the resolution of this issue, becasue the congestion can be caused
		// in the client by reducing the bitrate drastically, and it will stop being congested from the
		// client's perspective. what matters here is how many *distinct* clients report congestion
		// within a bucket, and whether that count suddenly jumps — not how long any one client's issue
		// stayed open.

		return false;
	}

	public clear(): void {
		this._trackedIssues.clear();
		this._history.length = 0;
		this._lastEvaluatedBucket = undefined;
	}

	public has(issue: ActiveClientIssue): boolean {
		return this._trackedIssues.has(issue);
	}

	public close(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}

		this.clear();
	}

	/** The completed buckets kept so far, oldest first. Read-only — for introspection/tests. */
	public get history(): readonly SfuCongestionDetectorBucket[] {
		return this._history;
	}

	// called at observer update, which is basically every client update
	public update(): void {

	}

	private _closeBucket(observedAt: number): void {
		const totalClients = this._observer.numberOfClients;
		const affectedClientIds = [ ...new Set(Array.from(this._trackedIssues, (issue) => issue.clientId)) ];
		const affectedCallIds = [ ...new Set(Array.from(this._trackedIssues, (issue) => issue.callId)) ];
		const congestedClients = affectedClientIds.length;
		const congestedClientRatio = 0 < totalClients ? congestedClients / totalClients : 0;

		this._history.push({
			observedAt,
			totalClients,
			congestedClients,
			congestedClientRatio,
			affectedClientIds,
			affectedCallIds,
		});

		while (this._config.historySize < this._history.length) this._history.shift();

		this._trackedIssues.clear();
	}

	/**
	 * Evaluate only the latest completed bucket (the candidate) against the buckets before it (the
	 * baseline) — never against itself. Reached once per newly-closed bucket via {@link update}; the
	 * identity check below additionally guards against evaluating the same bucket twice, in case
	 * `update()` is ever called again before the next rotation.
	 */
	private _evaluateLatestBucket(): void {
		const candidate = this._history[this._history.length - 1];

		if (candidate === this._lastEvaluatedBucket) return;
		this._lastEvaluatedBucket = candidate;

		const baseline = this._history.slice(0, -1);
		const evaluation = this._evaluateBucket(candidate, baseline);

		if (!evaluation.isCongested) return;

		const payload: SfuCongestionDetectorReport = {
			affectedCallIds: candidate.affectedCallIds,
			affectedClientIds: candidate.affectedClientIds,
			congestedClientRatio: candidate.congestedClientRatio,
			totalNumberOfClients: candidate.totalClients,
			numberOfCongestedClients: candidate.congestedClients,
			historySize: this._history.length,
			baselineCongestedClientRatio: evaluation.baselineCongestedClientRatio,
			robustZ: evaluation.robustZ,
			absoluteIncrease: evaluation.absoluteIncrease,
			relativeIncrease: evaluation.relativeIncrease,
		};

		this._observer.emit('observer-issue', {
			issue: {
				type: this._config.emittedObserverIssueType,
				timestamp: Date.now(),
				payload,
			},
			observer: this._observer,
		});
	}

	/**
	 * Is `candidate` — the latest completed bucket — abnormally high compared with the `baseline`
	 * buckets before it?
	 *
	 * Requires both **statistical** significance (a robust z-score against a median+MAD baseline —
	 * deliberately not Mann-Kendall, which asks "is this a monotonic trend", not "is the latest point
	 * an outlier"; a single sudden spike on an otherwise flat series is exactly what should trigger
	 * here and exactly what a trend test would miss) and **practical** significance (enough affected
	 * clients, and a big enough absolute/relative jump — a statistically significant move in a tiny
	 * or trivial ratio is not worth an alert).
	 */
	private _evaluateBucket(candidate: SfuCongestionDetectorBucket, baseline: SfuCongestionDetectorBucket[]): SfuCongestionDetectorEvaluation {
		const baselineRatios = baseline.map((bucket) => bucket.congestedClientRatio);
		const baselineMedian = median(baselineRatios) ?? 0;
		const robustZ = robustZScore(candidate.congestedClientRatio, baselineRatios) ?? 0;
		const absoluteIncrease = candidate.congestedClientRatio - baselineMedian;
		const relativeIncrease = 0 < baselineMedian
			? candidate.congestedClientRatio / baselineMedian
			: (0 < candidate.congestedClientRatio ? Infinity : 0);

		const isCongested = this._config.minHistorySize <= baseline.length + 1
			&& this._config.minAffectedClients <= candidate.congestedClients
			&& this._config.minAbsoluteRatioIncrease <= absoluteIncrease
			&& this._config.minRelativeRatioIncrease <= relativeIncrease
			&& this._config.robustZThreshold <= robustZ;

		return { isCongested, baselineCongestedClientRatio: baselineMedian, robustZ, absoluteIncrease, relativeIncrease };
	}
}

