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
	p75: number;
	p95: number;
};

/**
 * The p-th percentile (0..1) using linear interpolation between closest ranks.
 * Returns `undefined` for an empty input.
 */
export function percentile(values: number[], p: number): number | undefined {
	if (values.length === 0) return undefined;

	const sorted = [ ...values ].sort((a, b) => a - b);

	if (sorted.length === 1) return sorted[0];

	const clamped = Math.min(1, Math.max(0, p));
	const position = clamped * (sorted.length - 1);
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);

	if (lowerIndex === upperIndex) return sorted[lowerIndex];

	const weight = position - lowerIndex;

	return (sorted[lowerIndex] * (1 - weight)) + (sorted[upperIndex] * weight);
}

/** The median (50th percentile). `undefined` for an empty input. */
export function median(values: number[]): number | undefined {
	return percentile(values, 0.5);
}

/** Summarize a numeric sample set. Returns `undefined` for an empty input. */
export function summarize(values: number[]): StatsSummary | undefined {
	if (values.length === 0) return undefined;

	let min = values[0];
	let max = values[0];
	let sum = 0;

	for (const value of values) {
		if (value < min) min = value;
		if (max < value) max = value;
		sum += value;
	}

	return {
		count: values.length,
		min,
		max,
		mean: sum / values.length,
		median: percentile(values, 0.5) as number,
		p75: percentile(values, 0.75) as number,
		p95: percentile(values, 0.95) as number,
	};
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

/** An entry retained by {@link SlidingWindow}. */
export type SlidingWindowEntry<T> = {
	timestamp: number;
	value: T;
};

/**
 * A time-bounded ring buffer used by detectors that reason over a window ("N of M clients degraded
 * within 10 s"). Entries older than `windowMs` are evicted on write and on read.
 */
export class SlidingWindow<T> {
	private _entries: SlidingWindowEntry<T>[] = [];

	public constructor(
		public readonly windowMs: number,

		/** Optional hard cap on retained entries, to bound memory on very chatty inputs. */
		public readonly maxEntries = 1024,
	) {
	}

	/** Add an entry (defaults to `Date.now()`), then evict anything outside the window. */
	public add(value: T, timestamp = Date.now()): void {
		this._entries.push({ timestamp, value });
		this._evict(timestamp);
	}

	/** The entries still inside the window, oldest first. */
	public entries(now = Date.now()): SlidingWindowEntry<T>[] {
		this._evict(now);

		return this._entries;
	}

	/** The values still inside the window, oldest first. */
	public values(now = Date.now()): T[] {
		return this.entries(now).map((entry) => entry.value);
	}

	public get size(): number {
		return this._entries.length;
	}

	public clear(): void {
		this._entries = [];
	}

	private _evict(now: number) {
		const oldest = now - this.windowMs;

		while (0 < this._entries.length && this._entries[0].timestamp < oldest) {
			this._entries.shift();
		}
		while (this.maxEntries < this._entries.length) {
			this._entries.shift();
		}
	}
}
