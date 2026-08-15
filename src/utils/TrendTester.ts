import { pageHinkley, mannKendallVerdict, type PageHinkleyResult, type MannKendallResult } from './stats';

export type TrendTesterConfig = {

	/**
	 * How many of the most recent values to keep. The one knob that controls how far back "trend"
	 * looks, for both tests — there is deliberately no separate window per test.
	 */
	size?: number;

	/** Page-Hinkley's drift tolerance and detection threshold — see {@link pageHinkley}. */
	pageHinkleyDelta?: number;
	pageHinkleyLambda?: number;

	/** Mann-Kendall's significance level — see {@link mannKendallVerdict}. */
	mannKendallAlpha?: number;
};

/**
 * Streaming home for `stats.ts`'s two trend tests: feed it one value at a time via {@link add}
 * instead of re-running the batch functions over an array you manage yourself.
 *
 * ### The two tests answer different questions
 *
 * Take a client's RTT, sampled every couple of seconds. Two things can go wrong with it, and only
 * one of them looks like a spike:
 *
 * - **Mann-Kendall** asks *"is this drifting?"* — a monotonic trend, regardless of shape or scale.
 *   `40, 45, 52, 61, 70, 84 ms` is a rising path with no single dramatic step; every jump is small
 *   and plausible on its own. Mann-Kendall counts how many later samples exceed earlier ones and
 *   reports whether that lopsidedness could plausibly be chance. It is rank-based, so one absurd
 *   reading (a 4000 ms outlier from a stalled event loop) moves it by exactly one pair, not by the
 *   4000.
 * - **Page-Hinkley** asks *"did it change, and when?"* — a step. `40, 42, 39, 41, 180, 176, 182 ms`
 *   is not a trend at all; it is one level followed by a different level, which is what a route
 *   change or a TURN failover looks like. It accumulates the deviation from the running mean and
 *   fires when the cumulative excess passes `lambda`.
 *
 * Neither subsumes the other, which is why both live here on one window. A slow climb toward
 * unusability shows up in Mann-Kendall and never trips Page-Hinkley; a hard failover trips
 * Page-Hinkley immediately while Mann-Kendall may read `no-trend`, because after the step the series
 * is flat again. `tests/trendTester.spec.ts` builds both RTT series and shows exactly this.
 *
 * ```ts
 * const rtt = new TrendTester({ size: 30, mannKendallAlpha: 0.05, pageHinkleyLambda: 50 });
 *
 * peerConnection.on('update', () => {
 *   if (peerConnection.currentRttInMs === undefined) return;   // no measurement is not a measurement
 *   rtt.add(peerConnection.currentRttInMs);
 *
 *   if (rtt.mannKendall().trend === 'increasing') warn('RTT is drifting up');
 *   if (rtt.pageHinkley()?.changeDetected) {
 *     warn('RTT stepped');
 *     rtt.clear();   // the old level is no longer the baseline — judge the new one on its own
 *   }
 * });
 * ```
 *
 * ### Both read the same window
 *
 * `size` is the one knob controlling how far back either test looks. They are kept incremental
 * differently, because they don't tolerate an evicted point the same way:
 *
 * - **Mann-Kendall**'s statistic is a sum over *pairs*, so evicting the oldest value only touches
 *   the pairs it was part of — one pass over the (bounded) window corrects it in O(size) instead of
 *   the O(size²) a full recompute costs.
 * - **Page-Hinkley**'s statistic is a running minimum of a cumulative sum, which has no cheap
 *   correction for "forget this one old point" — the minimum may have depended on it. It is
 *   recomputed from the window on every {@link add} rather than hand-rolling an incremental version
 *   that would be easy to get subtly wrong. That recompute is O(size), the same order as above.
 *
 * ### Non-finite input is rejected, not absorbed
 *
 * See {@link add}. A single `NaN` would otherwise destroy the instance permanently.
 */
export class TrendTester {
	private readonly _size: number;
	private readonly _values: number[] = [];
	private readonly _tieCounts = new Map<number, number>();

	private readonly _pageHinkleyDelta: number;
	private readonly _pageHinkleyLambda: number;
	private readonly _mannKendallAlpha: number;

	private _s = 0;
	private _rejected = 0;
	private _pageHinkleyResult?: PageHinkleyResult;

	public constructor(config: TrendTesterConfig = {}) {
		// A window shorter than 2 can hold no pair, so Mann-Kendall has nothing to compare and eviction
		// (guarded on `length === _size`) would never fire for size 0 — the array would grow forever.
		this._size = Math.max(2, Math.floor(config.size ?? 30));
		this._pageHinkleyDelta = config.pageHinkleyDelta ?? 0;
		this._pageHinkleyLambda = config.pageHinkleyLambda ?? 50;
		this._mannKendallAlpha = config.mannKendallAlpha ?? 0.05;
	}

	/** Values rejected by {@link add} for being non-finite. Non-zero means the caller has a bug. */
	public get rejected(): number {
		return this._rejected;
	}

	/** How many values are currently in the window (`<= size`). */
	public get length(): number {
		return this._values.length;
	}

	/** The configured window length. */
	public get size(): number {
		return this._size;
	}

	/**
	 * Add the next value in the stream, evicting the oldest once the window is full.
	 *
	 * **Non-finite values are rejected** rather than stored, and the rejection is counted in
	 * {@link rejected}. This is not defensive noise — it is the difference between a bad reading and
	 * a bad instance. `Math.sign(NaN)` is `NaN`, so a single `NaN` would poison the incremental
	 * Mann-Kendall sum `_s` **permanently**: every later `add` and `_evictOldest` adds or subtracts
	 * `NaN`, the z-score is `NaN`, every comparison against it is `false`, and the tester silently
	 * reports `no-trend` forever after. It would also take a `NaN` key in `_tieCounts` that can never
	 * be matched on eviction, since `NaN !== NaN`.
	 *
	 * `undefined` RTT (no measurement this tick) must not be coerced to `0` and passed in either —
	 * "we didn't measure" is not "the trip took no time", and feeding zeros manufactures a downward
	 * trend. Skip the sample instead.
	 */
	public add(value: number): void {
		if (!Number.isFinite(value)) {
			++this._rejected;

			return;
		}

		if (this._values.length === this._size) this._evictOldest();

		for (let i = 0; i < this._values.length; i++) this._s += Math.sign(value - this._values[i]);
		this._values.push(value);
		this._bumpTie(value, 1);

		this._pageHinkleyResult = pageHinkley(this._values, this._pageHinkleyDelta, this._pageHinkleyLambda);
	}

	/** The current Page-Hinkley read-out over the window. `undefined` before the first value. */
	public pageHinkley(): PageHinkleyResult | undefined {
		return this._pageHinkleyResult;
	}

	/** The current Mann-Kendall read-out over the window. */
	public mannKendall(): MannKendallResult {
		const n = this._values.length;

		if (n < 2) return { s: 0, variance: 0, z: 0, pValue: 1, trend: 'no-trend' };

		// Tie correction is cheap to recompute at read time (one pass over the distinct groups, at
		// most `size` of them) rather than kept incremental like `_s` — it's only needed here.
		let tieCorrection = 0;

		for (const groupSize of this._tieCounts.values()) {
			if (1 < groupSize) tieCorrection += groupSize * (groupSize - 1) * ((2 * groupSize) + 5);
		}

		const variance = ((n * (n - 1) * ((2 * n) + 5)) - tieCorrection) / 18;

		return { s: this._s, variance, ...mannKendallVerdict(this._s, variance, this._mannKendallAlpha) };
	}

	/** Drop everything, e.g. after a detected change point, to start judging the trend fresh. */
	public clear(): void {
		this._values.length = 0;
		this._tieCounts.clear();
		this._s = 0;
		this._rejected = 0;
		this._pageHinkleyResult = undefined;
	}

	/** Remove the oldest value from the window and correct `_s` for the pairs it was part of. */
	private _evictOldest(): void {
		const removed = this._values.shift();

		if (removed === undefined) return;

		for (let i = 0; i < this._values.length; i++) this._s -= Math.sign(this._values[i] - removed);
		this._bumpTie(removed, -1);
	}

	private _bumpTie(value: number, delta: number): void {
		const count = (this._tieCounts.get(value) ?? 0) + delta;

		if (count <= 0) this._tieCounts.delete(value);
		else this._tieCounts.set(value, count);
	}
}
