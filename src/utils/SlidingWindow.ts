/** An entry retained by {@link SlidingWindow}. */
export type SlidingWindowEntry<T> = {
	timestamp: number;
	value: T;
};

/**
 * A time-bounded buffer used by detectors that reason over a window ("N of M clients degraded within
 * 10 s"). Entries older than `windowMs` are evicted on write and on read.
 *
 * ### Ordering is enforced, not assumed
 *
 * Eviction walks from the front and stops at the first entry still inside the window, which is only
 * correct if entries are ordered by timestamp. Callers mostly pass `Date.now()` and are ordered by
 * construction — but not always: a timestamp taken from a client sample, or two calls inside the
 * same millisecond, can arrive out of order, and one such entry would park itself at the head and
 * stop eviction *permanently*, so the window would grow without bound and keep reporting symptoms
 * from hours ago.
 *
 * Rather than trust the caller, {@link add} inserts in timestamp order. Appending (the overwhelmingly
 * common case) stays O(1); an out-of-order insert costs a short backward scan, because such entries
 * are near the tail in practice.
 *
 * ### The window advances on the newest observation
 *
 * Eviction is relative to the largest timestamp seen, not the one just passed. A caller that reads
 * with a `now` behind the newest entry (a replayed sample, a clock that stepped back) would
 * otherwise un-evict nothing and, worse, a caller passing an old `now` to {@link add} would evict
 * everything newer.
 */
export class SlidingWindow<T> {
	private _entries: SlidingWindowEntry<T>[] = [];
	private _latest = -Infinity;

	public constructor(
		public readonly windowMs: number,

		/** Optional hard cap on retained entries, to bound memory on very chatty inputs. */
		public readonly maxEntries = 1024,
	) {
	}

	/** Add an entry (defaults to `Date.now()`), then evict anything outside the window. */
	public add(value: T, timestamp = Date.now()): void {
		// A non-finite timestamp cannot be ordered or compared against the window edge; it would make
		// every subsequent eviction decision meaningless. Drop it rather than corrupt the buffer.
		if (!Number.isFinite(timestamp)) return;

		const entry = { timestamp, value };
		const last = this._entries[this._entries.length - 1];

		if (last === undefined || last.timestamp <= timestamp) {
			this._entries.push(entry);
		} else {
			let index = this._entries.length - 1;

			while (0 < index && timestamp < this._entries[index - 1].timestamp) --index;
			this._entries.splice(index, 0, entry);
		}

		if (this._latest < timestamp) this._latest = timestamp;
		this._evict(timestamp);
	}

	/**
	 * The entries still inside the window, oldest first.
	 *
	 * A **copy** — callers routinely map/sort what they get back, and handing out the live array let
	 * them mutate the window from the outside.
	 */
	public entries(now = Date.now()): SlidingWindowEntry<T>[] {
		this._evict(now);

		return [ ...this._entries ];
	}

	/** The values still inside the window, oldest first. */
	public values(now = Date.now()): T[] {
		this._evict(now);

		return this._entries.map((entry) => entry.value);
	}

	/**
	 * How many entries are inside the window as of `now`.
	 *
	 * Prefer this to `values(now).length`: counting through {@link values} allocates an array of every
	 * entry only to read its length, which on a hot path is the whole cost of the call.
	 */
	public count(now = Date.now()): number {
		this._evict(now);

		return this._entries.length;
	}

	/** Retained entries, without evicting first. See {@link count} for the windowed answer. */
	public get size(): number {
		return this._entries.length;
	}

	public clear(): void {
		this._entries = [];
		this._latest = -Infinity;
	}

	private _evict(now: number) {
		if (Number.isFinite(now) && this._latest < now) this._latest = now;

		const oldest = this._latest - this.windowMs;
		let expired = 0;

		while (expired < this._entries.length && this._entries[expired].timestamp < oldest) ++expired;

		// One splice instead of N shifts: `shift()` re-indexes the whole array each time, so evicting a
		// burst of k entries from a window of n cost O(k*n).
		if (0 < expired) this._entries.splice(0, expired);

		const excess = this._entries.length - this.maxEntries;

		if (0 < excess) this._entries.splice(0, excess);
	}
}
