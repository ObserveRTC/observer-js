import type { ActiveClientIssue } from './ActiveClientIssue';

/**
 * Something that wants to be **handed** open client issues rather than to go looking for them.
 *
 * Register one with `activeIssuesRegistry.addIssueTracker(type, tracker)` and it receives every
 * issue of that type when it opens ({@link add}) and when it closes ({@link delete}). A detector
 * implementing this pays only for the issues it actually consumes.
 *
 * `ActiveIssuesRegistry` implements it too, which is how a call's registry feeds the observer's.
 */
export interface ActiveIssueTracker {

	/** An issue of a subscribed type opened. */
	add(issue: ActiveClientIssue): void;

	/**
	 * An issue this tracker was given has closed.
	 *
	 * Return `true` if it was actually held. Returning `false` is legitimate and not an error — a
	 * tracker that counts *occurrences* (see `SfuCongestionDetector`) deliberately ignores
	 * resolutions, because when a symptom ended says nothing about how many endpoints reported it.
	 */
	delete(issue: ActiveClientIssue): boolean;

	/** How many issues this tracker currently holds. */
	size: number;

	/** Drop everything. Called when the owning scope closes. */
	clear(): void;

	has(issue: ActiveClientIssue): boolean;
}
