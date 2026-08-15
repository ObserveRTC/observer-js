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

/**
 * Detects a **shared** congestion event: many clients, across different calls, reporting congestion
 * inside the same slice of time.
 *
 * Only add this when the observer's calls all come from the **same SFU** — the finding's whole
 * meaning is "these clients have nothing in common except that server", and that is only true if the
 * server really is the common factor.
 *
 * ### Why fixed-interval buckets, and not the update tick
 *
 * The obvious implementation counts congested clients on each `update()`. It is wrong here, for two
 * separate reasons:
 *
 * - **The tick is not evenly spaced.** `update()` fires when a client is updated, so its rate is a
 *   function of how many clients are connected and how their sampling happens to interleave. Two
 *   counts taken from windows of different length are not comparable, and this detector's entire
 *   job is to compare a count against earlier counts.
 * - **Clients report on their own schedule.** A client sends a sample roughly every
 *   `samplesSendingTimeInMs`, unsynchronised with every other client. A window shorter than that
 *   systematically undercounts — half the congested clients simply hadn't spoken yet — and the
 *   undercount varies with arrival phase, which is noise indistinguishable from signal.
 *
 * So the detector runs on a wall-clock interval and closes a bucket every
 * `samplesSendingTimeInMs`, giving every client a fair chance to be heard in each one. Buckets are
 * equal-length and equally lagged, which is what makes bucket-to-bucket comparison mean something.
 * {@link update} is deliberately empty: nothing here is driven by the update tick.
 *
 * ### Occurrences, not intervals
 *
 * Unlike `ConcurrentIssueDetector`, this one ignores resolutions — see {@link delete}. It counts how
 * many *distinct clients reported* congestion in a bucket, not how many are still congested. A
 * client that hits congestion and immediately drops its bitrate resolves the issue within seconds
 * and would vanish from an open-interval view, yet it is exactly the evidence wanted here.
 */
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

		// Do not hold the process open. This is a monitoring side-channel: if the application has
		// nothing else to do, it should be allowed to exit, and without this a library import alone
		// keeps Node alive forever. Guarded because `unref` exists on Node timers but not in browsers
		// or under some test fake-timer implementations.
		this.timer.unref?.();
	}
	public get size() {
		return this._trackedIssues.size;
	}

	/** Record the issue against the bucket currently open. The timer, not this, closes the bucket. */
	public add(issue: ActiveClientIssue): void {
		this._trackedIssues.add(issue);
	}

	/**
	 * Deliberately a no-op returning `false`.
	 *
	 * Resolutions are not interesting here. A congested client typically fixes its own symptom by
	 * dropping bitrate hard, so the issue closes within seconds — but it still *happened*, and it is
	 * evidence that the server was under pressure during this bucket. What matters is how many
	 * distinct clients reported congestion within the bucket and whether that count suddenly jumps,
	 * not how long any one client's issue stayed open.
	 *
	 * Nothing leaks: the tracked set is emptied wholesale every time a bucket closes.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public delete(_issue: ActiveClientIssue): boolean {
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

		// Unsubscribe, or the registry keeps feeding a detector that has stopped rotating its buckets —
		// `_trackedIssues` would then grow for the life of the observer.
		this._observer.activeIssuesRegistry.removeIssueTracker(this);

		this.clear();
	}

	/** The completed buckets kept so far, oldest first. Read-only — for introspection/tests. */
	public get history(): readonly SfuCongestionDetectorBucket[] {
		return this._history;
	}

	/**
	 * Intentionally empty — see the class description.
	 *
	 * Everything here is driven by the bucket timer, because the update tick is neither evenly spaced
	 * nor long enough for every client to have reported. Counting on it would compare windows of
	 * different lengths and call the difference a signal.
	 */
	public update(): void {
		// no-op
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
			// Practical significance first: these are cheap, and they are what stop a statistically
			// perfect signal over three clients from waking anyone.
			&& this._config.minAffectedClients <= candidate.congestedClients
			&& this._config.minAbsoluteRatioIncrease <= absoluteIncrease
			&& this._config.minRelativeRatioIncrease <= relativeIncrease
			&& this._config.robustZThreshold <= robustZ;

		return { isCongested, baselineCongestedClientRatio: baselineMedian, robustZ, absoluteIncrease, relativeIncrease };
	}
}
