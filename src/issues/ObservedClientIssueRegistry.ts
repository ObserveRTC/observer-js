import type { ActiveClientIssue } from './ActiveClientIssue';
import type { ActiveIssueTracker } from './ActiveIssueTracker';

/**
 * One client's currently **open** stateful issues, keyed by `ClientIssue.key`.
 *
 * The server-side mirror of the client monitor's own active-issue map (client-monitor-js >= 4.6.0):
 * a raise opens an entry, the matching `<type>-resolved` closes it, and the client's own close
 * force-resolves whatever is left. That turns point-in-time symptom reports into **intervals**,
 * which is what lets detectors ask "are these clients broken *at the same time*" rather than "did
 * they both report something recently".
 *
 * Keyed by `key` rather than by type on purpose: one client can have several issues of the same type
 * open at once (one per track), and they resolve independently.
 *
 * Every change is forwarded to the call's `ActiveIssuesRegistry`, which forwards to the observer's —
 * so the client owns the storage and the wider scopes get their views maintained as it happens.
 */
export class ObservedClientIssueRegistry {
	private readonly issues = new Map<string, ActiveClientIssue>();

	public constructor(
		private readonly registry?: ActiveIssueTracker,
	) {
	}

	public get size(): number {
		return this.issues.size;
	}

	public keys(): IterableIterator<string> {
		return this.issues.keys();
	}

	public values(): IterableIterator<ActiveClientIssue> {
		return this.issues.values();
	}

	public get(key: string): ActiveClientIssue | undefined {
		return this.issues.get(key);
	}

	public add(issue: ActiveClientIssue): this {
		const existing = this.issues.get(issue.key);

		// Replacing a live key without retiring the old object would strand it in every upstream
		// registry and every subscribed tracker — nothing else holds the key to remove it later.
		if (existing && existing !== issue) this.registry?.delete(existing);

		this.issues.set(issue.key, issue);
		this.registry?.add(issue);

		return this;
	}

	public remove(key: string): ActiveClientIssue | undefined {
		const issue = this.issues.get(key);

		if (!issue) return undefined;

		this.issues.delete(key);
		this.registry?.delete(issue);

		return issue;
	}

	public clear(): void {
		// Snapshot the keys: `remove` mutates the map, and this is the teardown path — it has to visit
		// every entry exactly once, or the upstream registries keep issues for a client that is gone.
		for (const key of [ ...this.issues.keys() ]) this.remove(key);
	}
}
