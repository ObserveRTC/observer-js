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
		public readonly maxEntries = 1024
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
