import { createLogger } from '../common/logger';
import { ActiveClientIssue } from './ActiveClientIssue';
import { ActiveIssueTracker } from './ActiveIssueTracker';

const logger = createLogger('ActiveIssuesRegistry');

/**
 * The set of client issues currently believed to be **open**, plus the fan-out that pushes them to
 * whoever asked for them.
 *
 * ### Push, not poll
 *
 * A detector does not scan for the issues it cares about; it registers as an
 * {@link ActiveIssueTracker} for the types it consumes and is handed them as they open and close.
 * The cost of a detector is then proportional to the issues it actually receives, not to the number
 * of participants — a healthy 500-client fleet does no work per tick.
 *
 * ```ts
 * observer.activeIssuesRegistry.addIssueTracker('congestion', detector);
 * ```
 *
 * There is **no wildcard**. A tracker names the types it consumes, and nothing else reaches it. "Feed
 * me everything and I'll work out what matters" pushes the decision from the application — which
 * knows its client build and its issue vocabulary — onto a detector that has to guess, and it makes
 * the cost of a subscription unbounded and invisible. If a detector should watch five issue types,
 * the caller lists five issue types.
 *
 * ### Two levels
 *
 * Every call owns a registry constructed with the observer's as its `parent`. An add or delete
 * touches both, so a call-scoped tracker sees only that call's issues while an observer-scoped one
 * sees the fleet — without either side iterating the other. The child keeps **its own** storage:
 * `size` is this scope's count, and {@link clear} (called when the call closes) removes only this
 * scope's issues from the parent and never touches the parent's tracker registrations.
 *
 * ### Only keyed issues arrive here
 *
 * An issue without a `key` has no lifecycle — nothing can ever close it — so treating it as "active"
 * would mean holding a symptom that may have ended long ago. Keyless issues stay one-shot: emitted
 * as `client-issue`, never registered. `client-monitor-js` >= 4.6.0 sends `key` on everything
 * stateful.
 */
export class ActiveIssuesRegistry implements ActiveIssueTracker {
	private readonly issues = new Set<ActiveClientIssue>();
	private readonly typesToTrackers = new Map<string, ActiveIssueTracker[]>();

	public constructor(
		private readonly parent?: ActiveIssueTracker,
	) {
	}

	public get size(): number {
		return this.issues.size;
	}

	/**
	 * The open issues in this scope, in insertion order.
	 *
	 * Insertion order is age order (`observedAt` is assigned on insert), which is what lets a consumer
	 * stop at the first entry newer than its cutoff instead of scanning the whole set.
	 */
	public values(): IterableIterator<ActiveClientIssue> {
		return this.issues.values();
	}

	public [Symbol.iterator](): IterableIterator<ActiveClientIssue> {
		return this.issues.values();
	}

	public has(issue: ActiveClientIssue): boolean {
		return this.issues.has(issue);
	}

	public add(issue: ActiveClientIssue): this {
		// Re-adding an issue already held would push it to every tracker a second time, and a tracker
		// counting distinct occurrences would double count. `Set.add` is idempotent; the fan-out is not.
		if (this.issues.has(issue)) return this;

		this.issues.add(issue);
		this.parent?.add(issue);
		this._trackIssue(issue);

		return this;
	}

	public delete(issue: ActiveClientIssue): boolean {
		// Membership decides everything below: without this guard, deleting an issue this scope never
		// held still removes it from the parent — one call closing could evict another call's issues.
		if (!this.issues.delete(issue)) return false;

		this.parent?.delete(issue);
		this._untrackIssue(issue);

		return true;
	}

	/** Feed `tracker` every issue of `type` as it opens and closes. One call per type; no wildcard. */
	public addIssueTracker(type: string, tracker: ActiveIssueTracker): this {
		this.typesToTrackers.set(
			type,
			(this.typesToTrackers.get(type) ?? []).concat(tracker),
		);

		return this;
	}

	public removeIssueTracker(tracker: ActiveIssueTracker): this {
		for (const [ type, trackers ] of [ ...this.typesToTrackers ]) {
			const remaining = trackers.filter((candidate) => candidate !== tracker);

			// Drop the key rather than leaving an empty array behind, so a long-lived observer that
			// churns detectors doesn't accumulate one map entry per issue type ever seen.
			if (remaining.length === 0) this.typesToTrackers.delete(type);
			else this.typesToTrackers.set(type, remaining);
		}

		return this;
	}

	/**
	 * Drop every issue in this scope, e.g. because the call closed.
	 *
	 * Deletes through {@link delete} so the parent sheds exactly this scope's issues. Tracker
	 * *registrations* survive: a detector subscribed to the observer's registry must keep receiving
	 * issues after any one call ends.
	 */
	public clear(): void {
		for (const issue of [ ...this.issues ]) this.delete(issue);
	}

	private _trackIssue(issue: ActiveClientIssue): void {
		this._trackersOf(issue.type, (tracker) => tracker.add(issue));
	}

	private _untrackIssue(issue: ActiveClientIssue): void {
		this._trackersOf(issue.type, (tracker) => tracker.delete(issue));
	}

	/**
	 * Apply `apply` to every tracker interested in `type`.
	 *
	 * A tracker throwing must not abort the fan-out: the issue has already been added to (or removed
	 * from) this registry, so a partial dispatch would leave the remaining trackers permanently out of
	 * step with it. One broken detector should not desynchronise the others.
	 */
	private _trackersOf(type: string, apply: (tracker: ActiveIssueTracker) => void): void {
		const trackers = this.typesToTrackers.get(type);

		if (trackers) for (const tracker of trackers) this._safely(tracker, apply);
	}

	private _safely(target: ActiveIssueTracker, apply: (tracker: ActiveIssueTracker) => void): void {
		try {
			apply(target);
		} catch (err) {
			logger.warn('An issue tracker threw while being notified; continuing with the rest. %o', err);
		}
	}
}
