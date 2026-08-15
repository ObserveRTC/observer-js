import { createLogger } from '../common/logger';
import { ActiveClientIssue } from './ActiveClientIssue';
import { ActiveClientIssueCohort } from './ActiveClientIssueCohort';
import { ActiveIssueTracker } from './ActiveIssueTracker';

const logger = createLogger('ActiveIssuesRegistry');

export const EMPTY: ReadonlySet<ActiveClientIssue> = new Set();

export class ActiveIssuesRegistry implements ActiveIssueTracker{
	private readonly issues: ActiveIssueTracker;
	private readonly typesToTrackers = new Map<string, ActiveIssueTracker[]>();

	public constructor(issues?: ActiveIssueTracker) {
		this.issues = issues ?? new Set<ActiveClientIssue>();
	}


	public add(issue: ActiveClientIssue): this {
		this.issues.add(issue);
		this.trackIssue(issue);

		return this;
	}

	public delete(value: ActiveClientIssue): boolean {
		this.untrackIssue(value);

		return this.issues.delete(value);
	}

	public has(value: ActiveClientIssue): boolean {
		return this.issues.has(value);
	}
	public get size(): number {
		return this.issues.size;
	}
	public addIssueTracker(type: string, tracker: ActiveIssueTracker): this {
		this.typesToTrackers.set(
			type,
			(this.typesToTrackers.get(type) ?? []).concat(tracker)
		);

		return this;
	}

	public removeIssueTracker(tracker: ActiveIssueTracker): this {
		const entries = Array.from(this.typesToTrackers.entries());

		for (const [type, trackers] of entries) {
			this.typesToTrackers.set(
				type,
				trackers.filter((t) => t !== tracker)
			)
		}

		return this;
	}

	private trackIssue(issue: ActiveClientIssue): void {
		const trackers = this.typesToTrackers.get(issue.type);

		if (trackers) for (const tracker of trackers) {
			tracker.add(issue);
		}
	}

	private untrackIssue(issue: ActiveClientIssue): void {
		const trackers = this.typesToTrackers.get(issue.type);
		if (trackers) for (const tracker of trackers) {
			tracker.delete(issue);
		}
	}

	public clear(): void {
		for (const trackers of this.typesToTrackers.values()) {
			for (const tracker of trackers) {
				tracker.clear();
			}
		}

		this.issues.clear();
		this.typesToTrackers.clear();
	}
}


