import type { ClientIssue } from '../schema/ClientSample';

/** The suffix client-monitor-js appends to the type of a resolution entry. */
export const RESOLVED_ISSUE_SUFFIX = '-resolved';

/**
 * A **stateful** client issue the server currently believes to be open.
 *
 * client-monitor-js (>= 4.6.0, `sendResolvedIssuesToServer`) puts an issue's whole lifecycle on the
 * wire as two entries sharing a `key`:
 *
 * ```
 * raise:      { type: 'stuck-decoder',          key, payload,                                timestamp: raisedAt }
 * resolution: { type: 'stuck-decoder-resolved', key, payload: { raisedAt, comment, …final }, timestamp: resolvedAt }
 * ```
 *
 * The observer opens an `ActiveClientIssue` on the raise and closes it on the matching key, which
 * turns a stream of point-in-time symptom reports into **intervals**. That is what makes the
 * difference between "several clients reported congestion in the last 10 seconds" (a guess built on
 * an arbitrary window) and "several clients are congested *right now, simultaneously*" — the latter
 * being real evidence of a shared cause.
 *
 * Issues still active when the client monitor closes are auto-resolved by the client, so a clean
 * departure does not leak.
 */
export type ActiveClientIssue = {

	/** Identity shared by the raise and its resolution. Unique per client. */
	key: string;

	/** The issue type **without** the `-resolved` suffix (e.g. `'congestion'`). */
	type: string;

	/** The client that reported it. */
	clientId: string;

	/**
	 * The call that client belongs to. The dimension that separates "one bad meeting" from "our
	 * infrastructure": at observer scope, clients in *different* calls share nothing but the server.
	 */
	callId: string;

	/** When the client raised it (client clock). */
	raisedAt: number;

	/** When the observer first saw it (server clock) — skew-free, use this for cross-client timing. */
	observedAt: number;

	/** Parsed raise payload, when it was JSON. */
	payload?: Record<string, unknown>;

	/** `payload.peerConnectionId`, when present — most client detectors report it. */
	peerConnectionId?: string;

	/** `payload.trackId`, when present — the join key to a track (and thus to a publisher). */
	trackId?: string;
};

/** A closed interval: an {@link ActiveClientIssue} plus how it ended. */
export type ResolvedActiveClientIssue = ActiveClientIssue & {

	/** When the client resolved it (client clock). */
	resolvedAt: number;

	/** Observer-clock resolution time. */
	observedResolvedAt: number;

	/** `resolvedAt - raisedAt` as reported by the client, else derived from observer clocks. */
	durationInMs: number;

	/** Free-form note passed to `resolveIssue`. */
	comment?: string;

	/** Payload explicitly passed at resolution (the built-in detectors pass their final payload). */
	resolutionPayload?: Record<string, unknown>;

	/**
	 * How the interval ended: the client said so, the observer expired it, or the client left
	 * without resolving.
	 */
	resolvedBy: 'client' | 'timeout' | 'client-closed';
};

/** `true` when the entry is a resolution companion rather than a raise. */
export function isClientIssueResolutionEntry(issue: ClientIssue): boolean {
	return issue.type.endsWith(RESOLVED_ISSUE_SUFFIX);
}

/** Strip the `-resolved` suffix, so both entries of a lifecycle share one logical type. */
export function baseIssueType(type: string): string {
	return type.endsWith(RESOLVED_ISSUE_SUFFIX) ? type.slice(0, -RESOLVED_ISSUE_SUFFIX.length) : type;
}
