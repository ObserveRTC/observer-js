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
 * Both tests read from the same bounded window of the last `size` values, so growing/shrinking that
 * window changes how far back both look. They're kept incremental differently, because they don't
 * tolerate an evicted point the same way:
 *
 * - **Mann-Kendall**'s statistic is a sum over *pairs*, so evicting the oldest value only touches
 *   the pairs it was part of — one pass over the (bounded) window corrects it in
 *   O(size) instead of the O(size²) a full recompute costs.
 * - **Page-Hinkley**'s statistic is a running minimum of a cumulative sum, which has no cheap
 *   correction for "forget this one old point" — the minimum may have depended on it. It is
 *   recomputed from the window on every {@link add} instead of hand-rolling an incremental
 *   version that would be easy to get subtly wrong. That recompute is O(size), the same order as
 *   the Mann-Kendall update above.
 */
export class TrendTester {
	private readonly _size: number;
	private readonly _values: number[] = [];
	private readonly _tieCounts = new Map<number, number>();

	private readonly _pageHinkleyDelta: number;
	private readonly _pageHinkleyLambda: number;
	private readonly _mannKendallAlpha: number;

	private _s = 0;
	private _pageHinkleyResult?: PageHinkleyResult;

	public constructor(config: TrendTesterConfig = {}) {
		this._size = config.size ?? 30;
		this._pageHinkleyDelta = config.pageHinkleyDelta ?? 0;
		this._pageHinkleyLambda = config.pageHinkleyLambda ?? 50;
		this._mannKendallAlpha = config.mannKendallAlpha ?? 0.05;
	}

	/** How many values are currently in the window (`<= size`). */
	public get length(): number {
		return this._values.length;
	}

	/** The configured window length. */
	public get size(): number {
		return this._size;
	}

	/** Add the next value in the stream, evicting the oldest once the window is full. */
	public add(value: number): void {
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
