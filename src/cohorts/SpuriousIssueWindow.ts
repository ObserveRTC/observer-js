import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import { SlidingWindow } from "../utils/SlidingWindow";

/**
 * Judges whether the issues handed to it look like noise or a real, recurring signal, over a
 * **rolling time window** rather than a lifetime total — a type that fired constantly last week and
 * has been quiet since should read as quiet now, not "seen before, ignore it".
 *
 * Like {@link ActiveClientIssueCohort}, this class doesn't know the issue type either: whatever is
 * `add()`-ed is one occurrence to weigh in the window. Built on `SlidingWindow` (`utils/stats.ts`)
 * rather than reimplementing time-based eviction.
 */
export class SpuriousIssueWindow {
	private readonly _window: SlidingWindow<ActiveClientIssue>;

	public constructor(

		/** How far back (ms) an occurrence still counts towards {@link occurrences}. */
		public readonly windowMs: number,
		maxEntries = 1024,
	) {
		this._window = new SlidingWindow<ActiveClientIssue>(windowMs, maxEntries);
	}

	/** Record one occurrence — e.g. a raise, including re-raises of an already-open issue. */
	public add(issue: ActiveClientIssue, timestamp = Date.now()): void {
		this._window.add(issue, timestamp);
	}

	/** Occurrences still inside the window. */
	public occurrences(now = Date.now()): number {
		return this._window.values(now).length;
	}

	/**
	 * `true` when fewer than `minOccurrences` have fired inside the window — an isolated blip that
	 * hasn't repeated, rather than a pattern worth a detector's attention.
	 */
	public isSpurious(minOccurrences: number, now = Date.now()): boolean {
		return this.occurrences(now) < minOccurrences;
	}

	public clear(): void {
		this._window.clear();
	}
}
