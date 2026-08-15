/**
 * Small statistics helpers used by the aggregators and detectors.
 *
 * Rationale: a mean is a poor summary for call telemetry — one participant with a 1500 ms RTT
 * skews the average for nine healthy ones. Detectors should reason with medians, high percentiles
 * and "affected ratios" instead.
 */

/** A distribution summary of a numeric sample set. */
export type StatsSummary = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p25: number;
	p75: number;
	p95: number;
};

/**
 * The p-th percentile (0..1) using linear interpolation between closest ranks.
 * Returns `undefined` for an empty input.
 */
export function percentile(values: number[], p: number): number | undefined {
	if (values.length === 0) return undefined;

	return percentileOfSorted(values.slice().sort(ascending), p);
}

/** The median (50th percentile). `undefined` for an empty input. */
export function median(values: number[]): number | undefined {
	return percentile(values, 0.5);
}

/**
 * Median absolute deviation: `median(|value - median(values)|)`. A robust alternative to standard
 * deviation for describing how spread out `values` are — one wild outlier shifts a mean-based
 * deviation a lot, but barely moves a median. `undefined` for an empty input.
 */
export function medianAbsoluteDeviation(values: number[]): number | undefined {
	const centre = median(values);

	if (centre === undefined) return undefined;

	return median(values.map((value) => Math.abs(value - centre)));
}

/**
 * A robust z-score: how many (MAD-based) standard deviations `value` sits above/below the median of
 * `baseline`.
 *
 * Uses the median and MAD instead of the mean and standard deviation so a handful of baseline
 * outliers can't inflate the "normal" spread and mask a genuine spike — the same reasoning behind
 * {@link summarize}'s percentiles applies here to a single scalar spread. `1.4826` is the constant
 * that makes MAD estimate the standard deviation of a normal distribution, so the result reads on
 * the same scale as a classic z-score.
 *
 * A classic z-score divides by zero once every baseline value is identical (`MAD === 0`). Here:
 * `value` strictly above that constant baseline reads as `Infinity` — a spike with no precedent
 * whatsoever, however small; `value` at or below it reads as `0`, indistinguishable from the (flat)
 * baseline rather than a division error.
 *
 * ### Worked example
 *
 * A baseline of "share of clients reporting congestion", one entry per 10 s bucket, on a healthy
 * fleet: `[0.02, 0.01, 0.03, 0.04, 0.02]`. Median `0.02`, MAD `0.01`, so the scale is
 * `1.4826 * 0.01 ≈ 0.0148`.
 *
 * ```ts
 * robustZScore(0.03, baseline);   // ≈ 0.67  — an ordinary bucket
 * robustZScore(0.25, baseline);   // ≈ 15.5  — a quarter of the fleet at once; nothing like it before
 * ```
 *
 * Now add one bad bucket to the *baseline* — `[0.02, 0.01, 0.03, 0.04, 0.02, 0.40]`. A mean/stddev
 * z-score would absorb it: the mean climbs to `0.087` and the stddev to `~0.14`, so a genuine `0.25`
 * spike scores about `1.2` and looks unremarkable. **One past incident would hide the next one.**
 * Median and MAD barely move (median `0.025`, MAD `0.01`), so `0.25` still scores `≈15.2`. That
 * resistance is the entire reason for this function.
 *
 * The `Infinity` case is not an edge case in practice — it is a fleet that has been perfectly quiet:
 *
 * ```ts
 * robustZScore(0.10, [ 0, 0, 0, 0, 0 ]);   // Infinity — first congestion ever seen
 * robustZScore(0, [ 0, 0, 0, 0, 0 ]);      // 0        — still nothing happening
 * ```
 *
 * `Infinity` clears any finite threshold, which is intended: "we have never seen this" *is* the
 * strongest possible statistical statement. It is also why a caller must gate on practical
 * significance too — see `SfuCongestionDetector`, which additionally requires a minimum number of
 * affected clients, so a single client on a quiet fleet cannot page anyone.
 *
 * `undefined` when `baseline` is empty — there is nothing to compare against.
 */
export function robustZScore(value: number, baseline: number[]): number | undefined {
	const centre = median(baseline);

	if (centre === undefined) return undefined;

	const mad = medianAbsoluteDeviation(baseline) ?? 0;

	if (mad === 0) return centre < value ? Infinity : 0;

	return (value - centre) / (1.4826 * mad);
}

/** Summarize a numeric sample set. Returns `undefined` for an empty input. */
export function summarize(values: number[]): StatsSummary | undefined {
	const count = values.length;

	if (count === 0) return undefined;

	// Sort once and read everything off the sorted copy. Calling `percentile` three times would
	// copy-and-sort three times, which on the detector hot path meant thousands of redundant sorts
	// per tick — the aggregator produces one summary per metric per published track, every tick.
	const sorted = values.slice().sort(ascending);
	let sum = 0;

	for (let i = 0; i < count; i++) sum += sorted[i];

	return {
		count,
		min: sorted[0],
		max: sorted[count - 1],
		mean: sum / count,
		p25: percentileOfSorted(sorted, 0.25),
		median: percentileOfSorted(sorted, 0.5),
		p75: percentileOfSorted(sorted, 0.75),
		p95: percentileOfSorted(sorted, 0.95),
	};
}

const ascending = (a: number, b: number) => a - b;

/**
 * Linear-interpolated percentile of an **already ascending** array. The building block behind
 * {@link percentile} and {@link summarize}; exported so callers computing several percentiles over
 * the same data can sort once themselves.
 *
 * Passing an unsorted array yields a meaningless number rather than an error — sort first.
 */
export function percentileOfSorted(sorted: number[], p: number): number {
	if (sorted.length === 1) return sorted[0];

	const clamped = Math.min(1, Math.max(0, p));
	const position = clamped * (sorted.length - 1);
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);

	if (lowerIndex === upperIndex) return sorted[lowerIndex];

	const weight = position - lowerIndex;

	return (sorted[lowerIndex] * (1 - weight)) + (sorted[upperIndex] * weight);
}

/**
 * A counter-reset-safe delta: the increase of a cumulative counter between two observations.
 *
 * Returns `0` when the counter went backwards (reset / SSRC reuse) or when either side is missing.
 * NOTE the guard is `>=` on **defined** values — a previous value of `0` is a perfectly valid
 * baseline, so `0 -> 5` correctly yields `5` (using a truthiness check here silently drops the
 * first interval of every counter, which is exactly when the first loss/freeze event happens).
 */
export function counterDelta(previous: number | undefined, current: number | undefined): number {
	if (previous === undefined || current === undefined) return 0;
	if (current < previous) return 0;

	return current - previous;
}

/**
 * Pearson correlation of two equal-length series, clamped to `0..1`.
 *
 * Negative or undefined relationships read as `0`, because every caller here asks "does A follow B?"
 * — an inverse relationship is not a weaker yes, it is a no.
 */
export function correlation(xs: number[], ys: number[]): number {
	const n = Math.min(xs.length, ys.length);

	if (n < 2) return 0;

	let meanX = 0;
	let meanY = 0;

	for (let i = 0; i < n; i++) {
		meanX += xs[i];
		meanY += ys[i];
	}
	meanX /= n;
	meanY /= n;

	let covariance = 0;
	let varianceX = 0;
	let varianceY = 0;

	for (let i = 0; i < n; i++) {
		const dx = xs[i] - meanX;
		const dy = ys[i] - meanY;

		covariance += dx * dy;
		varianceX += dx * dx;
		varianceY += dy * dy;
	}

	if (varianceX === 0 || varianceY === 0) return 0;

	return Math.max(0, covariance / Math.sqrt(varianceX * varianceY));
}

/** Per-step result of {@link pageHinkley}. */
export type PageHinkleyResult = {

	/**
	 * The Page-Hinkley statistic after each observation, same length as the input — one value per
	 * `values[i]`, so `statistic[i]` is "how far the cumulative deviation has grown above its own
	 * historical low, using only `values[0..i]`". Never negative (it's a gap to a *minimum*), and
	 * `0` for as long as the process looks stable.
	 */
	statistic: number[];

	/**
	 * Index of the **first** observation whose statistic exceeded `lambda`, else `undefined`.
	 *
	 * This is a one-shot latch over the call's whole input: once found, later observations are not
	 * re-checked, even if the statistic subsequently falls back down (e.g. after a single transient
	 * spike — see the class doc example). "Is it *still* elevated right now" is a different
	 * question, answered by looking at the *tail* of {@link statistic}, or — for a live stream — by
	 * re-running this over a recent window each time (which is what `TrendTester` does) rather than
	 * over the whole history once.
	 */
	changePointIndex?: number;

	/** `true` when {@link changePointIndex} is defined. */
	changeDetected: boolean;
};

/**
 * Page-Hinkley test: sequential (online) detection of a sustained **increase** in the mean of
 * `values` — "has this metric settled onto a durably higher level", as opposed to "did one sample
 * come in high". A single noisy point should not read as a regression; ten points that are all a
 * bit higher than before should.
 *
 * ### How it works
 *
 * At step `i`, three numbers are tracked:
 *
 * 1. `mean` — the running average of `values[0..i]` (**not** a fixed baseline — it is recomputed
 *    from everything seen so far, including `values[i]` itself, which is what makes this
 *    *adaptive*: after a real shift, `mean` keeps drifting up to meet the new level, and the
 *    signal below fades back out on its own rather than staying triggered forever).
 * 2. `cumulative` — running sum of `(values[i] - mean - delta)`. Subtracting `mean` centres each
 *    term on "surprise relative to what we've seen so far"; subtracting `delta` on top means a
 *    small positive surprise still nets to a *negative* contribution, so it doesn't accumulate.
 * 3. `runningMinimum` — the lowest `cumulative` has ever been.
 *
 * The **Page-Hinkley statistic** is `cumulative - runningMinimum`: how far the running sum has
 * climbed above its own historical floor. Pure noise pulls `cumulative` up and down around a flat
 * trend, so the gap to `runningMinimum` stays small. A sustained increase pushes `cumulative`
 * mostly one direction — up — so `runningMinimum` stops updating and the gap grows every step,
 * crossing `lambda` once the shift is large/long enough to be sure it isn't noise. That first
 * crossing is {@link PageHinkleyResult.changePointIndex}.
 *
 * ### Parameters
 *
 * - `delta` — the **drift tolerance** (in the same units as `values`, e.g. ms of RTT): how much of
 *   a step-to-step increase is written off as noise rather than counted towards the cumulative sum.
 *   `0` means even a razor-thin, consistent upward creep eventually accumulates enough to trigger;
 *   raising it requires each observation to clear that bar above the running mean before it
 *   contributes anything (see the class doc's hand-worked example — the same jump that triggers
 *   with `delta: 0` is completely absorbed at `delta: 10`).
 * - `lambda` — the **detection threshold** the statistic must exceed. It is in "surprise units" (a
 *   sum of deviations, not a single observation's units), so there's no shortcut for picking it
 *   other than trying it against representative data — see the RTT examples in `stats.spec.ts` for
 *   a worked comparison of a low vs. a high `lambda` on the same series. Raising it delays
 *   detection but makes a false positive from a lucky run of noise less likely.
 *
 * O(n) — one pass, unlike {@link mannKendall}'s O(n²). To detect a **decrease** instead of an
 * increase, negate `values` before calling (or negate the result's meaning if you'd rather).
 */
export function pageHinkley(values: number[], delta = 0, lambda = 50): PageHinkleyResult {
	const statistic: number[] = [];
	let changePointIndex: number | undefined;

	let sum = 0;
	let cumulative = 0;
	let runningMinimum = 0;

	for (let i = 0; i < values.length; i++) {
		sum += values[i];
		const mean = sum / (i + 1);

		cumulative += values[i] - mean - delta;
		if (cumulative < runningMinimum) runningMinimum = cumulative;

		const ph = cumulative - runningMinimum;

		statistic.push(ph);
		if (changePointIndex === undefined && lambda < ph) changePointIndex = i;
	}

	return { statistic, changePointIndex, changeDetected: changePointIndex !== undefined };
}

/** Result of {@link mannKendall}. */
export type MannKendallResult = {

	/** Sum of pairwise signs (`sign(values[j] - values[i])` for every `i < j`). */
	s: number;

	/** Variance of {@link s}, corrected for tied values. */
	variance: number;

	/** Standard-normal score derived from `s`. `0` when `s` is `0` — no evidence either way. */
	z: number;

	/** Two-tailed p-value for the null hypothesis "no monotonic trend". */
	pValue: number;

	/** `'increasing'` / `'decreasing'` when significant at `alpha`, else `'no-trend'`. */
	trend: 'increasing' | 'decreasing' | 'no-trend';
};

/**
 * Mann-Kendall trend test: a non-parametric test for a **monotonic** trend in `values`, without
 * assuming a distribution or a constant rate of change — it only asks "are later values
 * consistently larger (or smaller) than earlier ones more often than chance would allow".
 *
 * Every pair `i < j` votes `+1` (`values[j] > values[i]`), `-1` (`values[j] < values[i]`) or `0`
 * (tie); `s` is the sum of those votes. Under the null hypothesis of no trend, `s` is
 * approximately normal with mean `0` and a known variance (corrected here for tied values), which
 * turns `s` into a Z score and a two-tailed p-value. `trend` is only `'increasing'` / `'decreasing'`
 * when that p-value clears `alpha` — a handful of mostly-ascending points is exactly what noise
 * looks like half the time, and this is what keeps that from reading as a trend.
 *
 * O(n²) (every pair is compared); fine for the small, per-tick sample counts detectors work with,
 * not for large historical series.
 */
export function mannKendall(values: number[], alpha = 0.05): MannKendallResult {
	const n = values.length;

	if (n < 2) return { s: 0, variance: 0, z: 0, pValue: 1, trend: 'no-trend' };

	let s = 0;

	for (let i = 0; i < n - 1; i++) {
		for (let j = i + 1; j < n; j++) {
			s += Math.sign(values[j] - values[i]);
		}
	}

	// Tie correction: ties reduce the number of informative comparisons, so they shrink the
	// variance relative to the tie-free formula `n(n-1)(2n+5)/18`.
	const tieGroupSizes = new Map<number, number>();

	for (const value of values) tieGroupSizes.set(value, (tieGroupSizes.get(value) ?? 0) + 1);

	let tieCorrection = 0;

	for (const groupSize of tieGroupSizes.values()) {
		if (1 < groupSize) tieCorrection += groupSize * (groupSize - 1) * ((2 * groupSize) + 5);
	}

	const variance = ((n * (n - 1) * ((2 * n) + 5)) - tieCorrection) / 18;

	return { s, variance, ...mannKendallVerdict(s, variance, alpha) };
}

/**
 * Turns a Mann-Kendall `s` statistic and its `variance` into a Z score, p-value and verdict — the
 * back half of {@link mannKendall}, split out so an incremental caller that maintains `s` /
 * `variance` itself (e.g. over a sliding window, correcting for evicted points rather than
 * recomputing every pair from scratch) doesn't have to reimplement the normal approximation.
 */
export function mannKendallVerdict(s: number, variance: number, alpha = 0.05): Pick<MannKendallResult, 'z' | 'pValue' | 'trend'> {
	let z = 0;

	if (variance > 0) {
		if (s > 0) z = (s - 1) / Math.sqrt(variance);
		else if (s < 0) z = (s + 1) / Math.sqrt(variance);
	}

	const pValue = 2 * (1 - standardNormalCdf(Math.abs(z)));
	const trend = z !== 0 && pValue < alpha ? (z > 0 ? 'increasing' : 'decreasing') : 'no-trend';

	return { z, pValue, trend };
}

/** Standard normal CDF via the Abramowitz & Stegun erf approximation (max error ~1.5e-7). */
function standardNormalCdf(x: number): number {
	return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
	const sign = x < 0 ? -1 : 1;
	const ax = Math.abs(x);

	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;

	const t = 1 / (1 + (p * ax));
	const y = 1 - (((((((((a5 * t) + a4) * t) + a3) * t) + a2) * t) + a1) * t * Math.exp(-(ax * ax)));

	return sign * y;
}
