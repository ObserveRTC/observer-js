import type { ObserverEvents, ObservedCallScope } from '../ObserverEvents';
import type { CallIssue } from '../common/Issue';

/**
 * The bus events that carry an `observedCall`, i.e. the ones an enricher can attribute to a summary.
 *
 * Derived from the event map rather than listed by hand, so it cannot drift: adding a call-scoped
 * event makes it enrichable automatically, and an enricher on an observer-scoped event
 * (`observer-issue`, `validation-ready`) will not compile — there is no single call it belongs to,
 * and quietly writing a fleet-wide fact into every open summary would be worse than a type error.
 */
export type CallScopedEventName = {
	[K in keyof ObserverEvents]: ObserverEvents[K][0] extends ObservedCallScope ? K : never;
}[keyof ObserverEvents];

/** A function that folds one event into the summary. Runs on every occurrence, for its own call. */
export type CallSummaryEnricher<K extends CallScopedEventName> =
	(summary: CallSummary, ...args: ObserverEvents[K]) => void;

/** The enricher map: any subset of the call-scoped events, each fully typed against its payload. */
export type CallSummaryEnrichers = {
	[K in CallScopedEventName]?: CallSummaryEnricher<K>;
};

/** The built-in sections. Ask for what you want; anything absent is simply not collected. */
export type CallSummarySection = 'clients' | 'issues' | 'turnServers' | 'scores';

export type CallSummaryConfig = {

	/**
	 * Which built-in sections to accumulate. Empty (the default) collects none of them — a summary
	 * with only `enrich` is a perfectly good summary.
	 */
	include: CallSummarySection[];

	/**
	 * Fold arbitrary state in from any call-scoped event, into `summary.attachments`. See
	 * {@link CallSummaryEnrichers}.
	 *
	 * Each enricher runs on **every** occurrence of its event, for its own call, so prefer the
	 * low-frequency lifecycle events (`client-joined`, `call-issue`) over `client-updated`, which fires
	 * once per sample per client. Keep them cheap and side-effect free: an enricher that throws is logged
	 * and skipped rather than allowed to disturb the call, but one that is slow is on the ingestion path.
	 */
	enrich?: CallSummaryEnrichers;

	/**
	 * Cap on retained issues. Default `500`.
	 *
	 * A bound on memory per call, so scale it by how long your calls run and how noisy they are, not by
	 * taste — a two-hour call with a struggling participant can raise hundreds. Past the cap issues are
	 * dropped and `summary.truncated.issues` counts them, so the real total stays recoverable as
	 * `issues.length + (truncated?.issues ?? 0)`. `0` collects the count only, keeping no issue objects.
	 */
	maxIssues: number;

	/**
	 * Cap on retained client ids. Default `10_000`.
	 *
	 * High because the elements are short strings and the usual reason to read a summary is *who was in
	 * this call*. It exists so a webinar-scale room cannot grow the summary without limit. Overflow is
	 * counted in `summary.truncated.clientIds`; `joined`, `left` and `peak` are unaffected by the cap,
	 * since they are counters rather than a list.
	 */
	maxClientIds: number;
};

/**
 * Who was in the call over its whole life — not just who is in it now.
 *
 * Deliberately identifiers and counts only. Anything *about* a client — browser, platform, region —
 * is already on `observedClient` while the call is live, and belongs in `attachments` via an enricher
 * if you want it kept. Duplicating it here would mean the library deciding which client attributes
 * matter, and it would mean reading the highest-frequency event on the bus to do it.
 */
export type CallSummaryClients = {

	/** Every client id seen, in join order, capped by `maxClientIds`. */
	clientIds: string[];

	/** The most participants present at any one moment. */
	peak: number;

	joined: number;
	left: number;
};

/** Which TURN relays carried this call's media. */
export type CallSummaryTurnServers = {
	serverUrls: string[];

	/** Distinct clients seen relaying through any of them. */
	clientsRelayed: number;
};

/** The call score over time. Percentiles, not a mean — see `utils/stats`. */
export type CallSummaryScores = {
	min?: number;
	max?: number;
	median?: number;

	/** How many score readings went into the above. `0` means nothing was measured. */
	samples: number;
};

/** What had to be dropped to stay within the caps. Absent when nothing was. */
export type CallSummaryTruncation = {
	issues?: number;
	clientIds?: number;
};

/**
 * An accumulating record of one call's life, finalised when the call closes.
 *
 * ### Why this exists
 *
 * Everything else in this library is about *now*. Detectors answer "is something wrong right now",
 * validators answer a structural question once, and both read state that the call throws away when
 * it ends. Nothing kept the answer to *"what happened in that meeting?"* — who was in it, what was
 * raised, how it scored — and that is the question asked after the call, by support, by billing, by
 * whoever is writing the incident note.
 *
 * ### It is opt-in, and its sections are opt-in
 *
 * `observedCall.summary` is `undefined` unless a summary was configured, and each section is present
 * only if it was requested. **An absent section means "not collected", never "nothing happened"** —
 * the same rule as `inconclusive` on a validator. Reading `summary.issues` as "this call had no
 * issues" when `'issues'` was never in `include` is the one misreading this type invites, so it does
 * not offer a default-empty section to make it easy.
 *
 * ### Read it live, receive it once
 *
 * The object is live: read `observedCall.summary` at any point during the call. It is also delivered
 * on the `call-summary` event, emitted inside `close()` while the call is still reachable — after
 * that the call is gone from `observer.observedCalls` and there is nothing left to ask.
 */
export type CallSummary = {
	callId: string;

	/** First client join (client clock), as `ObservedCall` computed it. */
	startedAt?: number;

	/** Last client leave. */
	endedAt?: number;

	/** `endedAt - startedAt`, when both are known. */
	durationInMs?: number;

	/** When the summary itself was finalised (observer clock). Set by `close()`. */
	closedAt?: number;

	clients?: CallSummaryClients;

	/**
	 * Every issue raised against this call, in the order they were raised, capped by `maxIssues`.
	 *
	 * Just the issues — no derived tallies. A count is `issues.length`, a per-type count is one
	 * `filter`, and either is cheaper to write at the call site than to keep correct here. The one
	 * thing you cannot derive is what the cap discarded, which is why `truncated.issues` exists:
	 * the issues actually raised is `issues.length + (truncated?.issues ?? 0)`.
	 */
	issues?: CallIssue[];
	turnServers?: CallSummaryTurnServers;
	scores?: CallSummaryScores;

	/**
	 * Whatever your enrichers put here. The library never writes to it, so it cannot collide with a
	 * section added in a future version.
	 *
	 * **`attachments`, not `appData`, and the distinction is load-bearing.** `appData` is the live
	 * working state an application hangs off an entity for the entity's lifetime, and it may hold
	 * references that cannot be serialised — a mediasoup router, an `RTCPeerConnection`, a socket. A
	 * summary is the opposite: it outlives the call precisely so it can be *shipped* — archived,
	 * queued, written to a column — and it is handed to you on `call-summary` at the moment the call
	 * it came from is being torn down. Anything unserialisable in it is a reference to something
	 * already gone.
	 *
	 * So put serialisable facts here, the same contract as `attachments` on a `ClientSample`. If you
	 * need the live object, read it off `observedCall` / `observedClient` inside the enricher and
	 * attach what you can serialise: the router's `id`, not the router.
	 */
	attachments: Record<string, unknown>;

	/**
	 * What the caps discarded, and how much.
	 *
	 * Present **only** when something was actually dropped. A silently truncated summary is worse
	 * than no summary — someone will count `log.length` and report it as the issue count — so the
	 * shortfall is stated rather than left to be inferred from a suspiciously round number.
	 */
	truncated?: CallSummaryTruncation;
};

/** The defaults a summary is created with. Caps are generous but finite; see {@link CallSummary}. */
export const defaultCallSummaryConfig: CallSummaryConfig = {
	include: [],
	maxIssues: 500,
	maxClientIds: 10_000,
};

/** A fresh summary for `callId`, with only the requested sections present. */
export function createCallSummary(callId: string, config: CallSummaryConfig): CallSummary {
	const summary: CallSummary = { callId, attachments: {} };

	if (config.include.includes('clients')) {
		summary.clients = { clientIds: [], peak: 0, joined: 0, left: 0 };
	}
	if (config.include.includes('issues')) {
		summary.issues = [];
	}
	if (config.include.includes('turnServers')) {
		summary.turnServers = { serverUrls: [], clientsRelayed: 0 };
	}
	if (config.include.includes('scores')) {
		summary.scores = { samples: 0 };
	}

	return summary;
}
