import { createLogger } from '../common/logger';
import { percentile } from '../utils/stats';
import type { Observer } from '../Observer';
import type { ObservedCall } from '../ObservedCall';
import type { ObserverEvents } from '../ObserverEvents';
import { createCallSummary, type CallSummary, type CallSummaryConfig, type CallScopedEventName } from './CallSummary';

const logger = createLogger('CallSummaryCollector');

/** Per-call scratch the summary itself has no place for — score readings awaiting a percentile. */
type CallScratch = {
	scores: number[];
	turnClientIds: Set<string>;
};

/**
 * Keeps every configured `CallSummary` up to date, from **observer-level** bus subscriptions.
 *
 * ### Why one collector and not one per call
 *
 * The obvious implementation subscribes each call's summary to the events it needs. But the bus is
 * observer-wide: a listener attached for call A is invoked for every event of every call, so that
 * design costs `calls × events` listeners *and* `calls` invocations per event — quadratic in the
 * thing most likely to be large. At 500 concurrent calls and eight subscribed events that is 4 000
 * listeners doing 500 no-op calls each, per event.
 *
 * So the collector attaches **one listener per event type, once**, and routes each event to the
 * summary of the call it names. Cost is O(subscribed event types), independent of how many calls are
 * in flight, and an event for a call with no summary costs one `undefined` check.
 *
 * ### Only call-scoped events
 *
 * Routing needs `observedCall` on the payload, which is exactly what `CallScopedEventName` selects.
 * Observer-scoped events have no single call to attribute to; see that type for why fanning them out
 * to every open summary would be worse than refusing.
 */
export class CallSummaryCollector {
	private readonly _scratch = new WeakMap<CallSummary, CallScratch>();
	private readonly _listeners: { event: keyof ObserverEvents, listener: (...args: never[]) => void }[] = [];
	private _closed = false;

	public constructor(
		private readonly _observer: Observer,
		private readonly _config: CallSummaryConfig,
	) {
		this._subscribeBuiltIns();
		this._subscribeEnrichers();
	}

	/**
	 * Build a summary for `callId` and start tracking it.
	 *
	 * Creating it here, rather than letting the call create one and hand it over, keeps the resolved
	 * configuration inside the single object that owns it — and makes it impossible to end up with a
	 * summary whose sections nobody subscribed to fill.
	 */
	public createSummary(callId: string): CallSummary {
		const summary = createCallSummary(callId, this._config);

		this._scratch.set(summary, { scores: [], turnClientIds: new Set() });

		return summary;
	}

	/**
	 * Finalise `call`'s summary: fold in what only makes sense once, and stamp the closing times.
	 *
	 * Percentiles are computed here rather than on every update — a median recomputed per tick over a
	 * growing array is quadratic work to produce a number nobody reads until the end.
	 */
	public finalise(call: ObservedCall): void {
		const summary = call.summary;

		if (!summary) return;

		const scratch = this._scratch.get(summary);

		summary.startedAt = call.startedAt;
		summary.endedAt = call.endedAt;
		summary.durationInMs = summary.startedAt !== undefined && summary.endedAt !== undefined
			? Math.max(0, summary.endedAt - summary.startedAt)
			: undefined;
		summary.closedAt = Date.now();

		if (summary.scores && scratch) {
			summary.scores.samples = scratch.scores.length;
			if (0 < scratch.scores.length) {
				summary.scores.min = Math.min(...scratch.scores);
				summary.scores.max = Math.max(...scratch.scores);
				summary.scores.median = percentile(scratch.scores, 0.5);
			}
		}

		if (summary.turnServers && scratch) {
			summary.turnServers.clientsRelayed = scratch.turnClientIds.size;
		}
	}

	/** Drop every bus subscription. Called when the observer closes. */
	public close(): void {
		if (this._closed) return;
		this._closed = true;

		for (const { event, listener } of this._listeners) {
			this._observer.off(event, listener as never);
		}
		this._listeners.length = 0;
	}

	/**
	 * Subscribe `listener` to `event`, routed to the summary of the call the event names.
	 *
	 * The `observedCall` is read off the payload rather than closed over, which is what lets one
	 * subscription serve every call.
	 */
	private _on<K extends CallScopedEventName>(
		event: K,
		handler: (summary: CallSummary, scratch: CallScratch, ...args: ObserverEvents[K]) => void,
	): void {
		const listener = (...args: ObserverEvents[K]) => {
			const summary = (args[0] as { observedCall: ObservedCall }).observedCall.summary;

			if (!summary) return;

			const scratch = this._scratch.get(summary);

			if (!scratch) return;

			try {
				handler(summary, scratch, ...args);
			} catch (err) {
				// A summary is a side-channel. Nothing about a call should break because a field could
				// not be recorded — least of all an application's own enricher.
				logger.warn('A call-summary handler for %s threw; continuing. %o', event, err);
			}
		};

		this._observer.on(event, listener as never);
		this._listeners.push({ event, listener: listener as never });
	}

	private _subscribeBuiltIns(): void {
		const include = this._config.include;

		if (include.includes('clients')) {
			this._on('client-added', (summary, _scratch, { observedCall, observedClient }) => {
				const clients = summary.clients;

				if (!clients) return;

				clients.joined += 1;
				clients.peak = Math.max(clients.peak, observedCall.observedClients.size);

				if (clients.clientIds.length < this._config.maxClientIds) {
					clients.clientIds.push(observedClient.clientId);
				} else {
					summary.truncated = { ...summary.truncated, clientIds: (summary.truncated?.clientIds ?? 0) + 1 };
				}
			});

			this._on('client-closed', (summary) => {
				if (summary.clients) summary.clients.left += 1;
			});
		}

		if (include.includes('issues')) {
			this._on('call-issue', (summary, _scratch, { issue }) => {
				const issues = summary.issues;

				if (!issues) return;

				// Past the cap the issue is dropped, but the fact that it existed is not: `truncated`
				// carries the shortfall, so the true count stays recoverable from a bounded summary.
				if (issues.length < this._config.maxIssues) issues.push(issue);
				else summary.truncated = { ...summary.truncated, issues: (summary.truncated?.issues ?? 0) + 1 };
			});
		}

		if (include.includes('scores') || include.includes('turnServers')) {
			this._on('call-updated', (summary, scratch, { observedCall }) => {
				if (summary.scores && observedCall.score !== undefined) scratch.scores.push(observedCall.score);

				if (!summary.turnServers) return;

				for (const clientId of observedCall.clientsUsedTurn) scratch.turnClientIds.add(clientId);

				for (const client of observedCall.observedClients.values()) {
					for (const peerConnection of client.observedPeerConnections.values()) {
						for (const pair of peerConnection.selectedIceCandiadtePairForTurn) {
							const url = pair.getLocalCandidate()?.url;

							if (url && !summary.turnServers.serverUrls.includes(url)) {
								summary.turnServers.serverUrls.push(url);
							}
						}
					}
				}
			});
		}
	}

	private _subscribeEnrichers(): void {
		const enrich = this._config.enrich;

		if (!enrich) return;

		for (const name of Object.keys(enrich) as CallScopedEventName[]) {
			const enricher = enrich[name];

			if (!enricher) continue;

			this._on(name, (summary, _scratch, ...args) => (enricher as (s: CallSummary, ...a: unknown[]) => void)(summary, ...args));
		}
	}
}
