import { ActiveClientIssue } from "..";

export interface ActiveIssueTracker {
	add(issue: ActiveClientIssue): void;
	delete(issue: ActiveClientIssue): boolean;
	size: number;
	clear(): void;
	has(issue: ActiveClientIssue): boolean;
}