import { ActiveClientIssue } from "..";
import { ActiveIssueTracker } from "./ActiveIssueTracker";


export class ObservedClientIssueRegistry {
	private readonly issues = new Map<string, ActiveClientIssue>();

	public constructor(
		private readonly registry?: ActiveIssueTracker
	) {
	}

	public keys(): IterableIterator<string> {
		return this.issues.keys();
	}

	public values(): IterableIterator<ActiveClientIssue> {
		return this.issues.values();
	}

	public add(issue: ActiveClientIssue): this {
		this.issues.set(issue.key, issue);
		this.registry?.add(issue);

		return this;
	}

	public remove(key: string, resolvedBy?: string): ActiveClientIssue | undefined {
		const issue = this.issues.get(key);

		if (!issue) return;

		this.registry?.delete(issue);

		this.issues.delete(key);

		return issue;
	}

	public get(key: string): ActiveClientIssue | undefined {
		return this.issues.get(key);
	}

	public get size(): number {
		return this.issues.size;
	}

	public clear(): void {
		for (const key of this.issues.keys()) {
			this.remove(key);
		}
	}
}
