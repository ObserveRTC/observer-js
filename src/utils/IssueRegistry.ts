import type { ObservedCall } from '../ObservedCall';
import type { Observer } from '../Observer';
import type { ActiveClientIssue } from '../common/ActiveClientIssue';

/** A snapshot of everyone currently reporting one issue type. */
export type IssueCohort = {

	/** The issue type, without the `-resolved` suffix. */
	type: string;

	/** The open intervals of that type, one per (client, key). */
	issues: ActiveClientIssue[];

	/** Distinct clients with at least one open interval of this type. */
	clientIds: string[];

	/** `clientIds.length / totalClients` (0..1). */
	affectedRatio: number;

	/** Clients considered for the ratio. */
	totalClients: number;

	/**
	 * Spread of the onsets, in **observer** time (ms) — `max(observedAt) - min(observedAt)`.
	 *
	 * Measured on the observer clock on purpose: `raisedAt` comes from each client's own clock, and
	 * comparing those across machines makes clock skew look like an infrastructure event. A small
	 * spread means the issues began together, which is the signature of a shared cause.
	 */
	onsetSpreadInMs: number;

	/** The earliest onset (observer clock). */
	firstObservedAt: number;
};

/** Options controlling how long an unresolved issue is trusted. */
export type IssueRegistryConfig = {

	/**
	 * Drop an active issue this long after it was opened, even without a resolution (ms).
	 *
	 * A safety net for the case the lifecycle can't cover: a client that dies without its monitor
	 * running `close()` never sends the `-resolved` companion, and a stuck "active" issue would make
	 * every concurrency detector fire forever. Default `120_000`.
	 */
	maxIssueAgeInMs: number;
};

const defaultConfig: IssueRegistryConfig = {
	maxIssueAgeInMs: 120_000,
};

/**
 * Read-side index over the **active** client issues in a call (or across an observer's calls).
 *
 * `ObservedClient.activeIssues` holds the raw per-client state; this puts the questions detectors
 * actually ask on top of it:
 *
 * - *who currently has issue X?* → {@link cohortOf}
 * - *which issue types are shared by several clients right now?* → {@link cohorts}
 * - *which receivers of this published track are broken?* → {@link byTrackIds}
 *
 * The distinction that matters is **concurrency**. A window-based count ("N clients reported
 * congestion in the last 10 s") is a heuristic that has to guess whether the symptoms are still
 * happening; an active-issue set is ground truth, because the client tells the server when the
 * episode ends. Overlapping intervals are much stronger evidence of a common cause than
 * near-in-time reports.
 *
 * It is a *view*, holding no state of its own beyond configuration, so it can be constructed per
 * detector and queried on every `update()`.
 */
export class IssueRegistry {
	private readonly _config: IssueRegistryConfig;

	public constructor(
		private readonly _source: ObservedCall | Observer,
		config: Partial<IssueRegistryConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
	}

	/** Every open issue in scope, with stale entries filtered out. */
	public activeIssues(now = Date.now()): ActiveClientIssue[] {
		const result: ActiveClientIssue[] = [];

		for (const client of this._clients()) {
			for (const issue of client.activeIssues.values()) {
				if (this._config.maxIssueAgeInMs < now - issue.observedAt) continue;
				result.push(issue);
			}
		}

		return result;
	}

	/** The number of clients in scope — the denominator for every ratio. */
	public get totalClients(): number {
		let count = 0;

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for (const client of this._clients()) count += 1;

		return count;
	}

	/** The cohort for one issue type (empty `issues` when nobody has it open). */
	public cohortOf(type: string, now = Date.now()): IssueCohort {
		return this._toCohort(type, this.activeIssues(now).filter((issue) => issue.type === type));
	}

	/** One cohort per issue type currently open somewhere in scope, largest first. */
	public cohorts(now = Date.now()): IssueCohort[] {
		const byType = new Map<string, ActiveClientIssue[]>();

		for (const issue of this.activeIssues(now)) {
			const list = byType.get(issue.type);

			if (list) list.push(issue);
			else byType.set(issue.type, [ issue ]);
		}

		return [ ...byType.entries() ]
			.map(([ type, issues ]) => this._toCohort(type, issues))
			.sort((a, b) => b.clientIds.length - a.clientIds.length);
	}

	/**
	 * Open issues attributed to any of the given track ids — the join that turns a receiver-side
	 * issue into a statement about a **published** track (`trackId` → inbound track →
	 * `remoteOutboundTrack` → publisher).
	 */
	public byTrackIds(trackIds: Iterable<string>, now = Date.now()): ActiveClientIssue[] {
		const wanted = new Set(trackIds);

		return this.activeIssues(now).filter((issue) => issue.trackId !== undefined && wanted.has(issue.trackId));
	}

	/** Open issues reported by one client. */
	public byClientId(clientId: string, now = Date.now()): ActiveClientIssue[] {
		return this.activeIssues(now).filter((issue) => issue.clientId === clientId);
	}

	private _toCohort(type: string, issues: ActiveClientIssue[]): IssueCohort {
		const clientIds = [ ...new Set(issues.map((issue) => issue.clientId)) ];
		const onsets = issues.map((issue) => issue.observedAt);
		const totalClients = this.totalClients;

		return {
			type,
			issues,
			clientIds,
			totalClients,
			affectedRatio: 0 < totalClients ? clientIds.length / totalClients : 0,
			onsetSpreadInMs: 0 < onsets.length ? Math.max(...onsets) - Math.min(...onsets) : 0,
			firstObservedAt: 0 < onsets.length ? Math.min(...onsets) : 0,
		};
	}

	/** Works for both scopes: a call yields its clients, an observer yields every call's clients. */
	private *_clients() {
		const source = this._source as unknown as {
			observedClients?: ObservedCall['observedClients'],
			observedCalls?: Observer['observedCalls'],
		};

		if (source.observedClients) {
			yield* source.observedClients.values();
		} else if (source.observedCalls) {
			for (const call of source.observedCalls.values()) yield* call.observedClients.values();
		}
	}
}
