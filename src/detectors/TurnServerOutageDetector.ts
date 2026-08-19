import type { Detector } from './Detector';
import type { Observer } from '../Observer';
import type { ObservedPeerConnection } from '../ObservedPeerConnection';

export const TurnServerOutageTypes = {
	/** One TURN server's relayed population collapsed while the rest of the fleet is fine. */
	turnServerOutage: 'TURN_SERVER_OUTAGE',
} as const;

export type TurnServerOutageDetectorConfig = {

	/**
	 * Clients a server must have been carrying at its peak before its collapse means anything. Default
	 * `5`.
	 *
	 * Below this, one or two people leaving looks like an outage. Sensible range `5`–`50`; the higher it
	 * is the more confident the finding, and the more small deployments go unwatched.
	 */
	minClientsAtPeak: number;

	/**
	 * Fraction of the peak population that must be gone or disrupted. Default `0.8` — an outage is
	 * near-total by definition; partial degradation is `TurnServerHealthDetector`'s question.
	 */
	lossRatioThreshold: number;

	/**
	 * Window the peak population is measured over (ms). Default `120_000`.
	 *
	 * Long enough to span a real outage's onset, short enough that yesterday's peak is not held against
	 * today. Typical `60_000`–`600_000`. Too long and the natural end of a busy period reads as a
	 * collapse; too short and a gradual failure never shows a peak to fall from.
	 */
	peakWindowMs: number;

	/**
	 * Require a healthy **control group** — clients not relayed through this server that are still
	 * connected — before blaming the server. Without this, a call ending, a fleet-wide network
	 * event, or the observer shutting down all look exactly like a TURN outage. Default `true`.
	 */
	requireControlGroup: boolean;

	/**
	 * Clients elsewhere before the control group is worth anything. Default `5`.
	 *
	 * If you run a single TURN server there is never a control group, so with `requireControlGroup: true`
	 * this detector can never fire — which is correct rather than unfortunate: with one relay you cannot
	 * distinguish "the relay died" from "everyone went home". Sensible range `5`–`20`.
	 */
	minControlGroupClients: number;

	/**
	 * Fraction of the control group that must still be healthy, `0`–`1`. Default `0.7`.
	 *
	 * The evidence that the rest of the world is fine. Typical `0.6`–`0.9`. Set it too high and a
	 * concurrent unrelated problem elsewhere masks a real outage; too low and a fleet-wide network event
	 * gets blamed on whichever server lost clients first.
	 */
	controlGroupHealthyRatio: number;

	/**
	 * Consecutive `observer.update()` ticks the condition must hold before raising. Default `2`.
	 *
	 * Counts ticks, not time. `1` will fire on a single tick where a batch of clients happened to be
	 * between samples; `2`–`4` is the useful range for something this consequential to declare.
	 */
	consecutiveTicks: number;

	/**
	 * Re-arm time (ms) per server. Long by default (`300_000`) — an outage is one event, not one
	 * per tick, and a server that stays down would otherwise alert forever.
	 */
	cooldownMs: number;
};

/** ICE / connection states treated as "this client is not currently relaying". */
const brokenStates = new Set([ 'disconnected', 'failed', 'closed' ]);

type PeakEntry = { clients: number, at: number };

/**
 * Detects a **TURN server outage** — a relay that has stopped serving — by watching its client
 * population collapse while the rest of the fleet carries on.
 *
 * This is the case its sibling `TurnServerHealthDetector` structurally *cannot* see, and the
 * distinction is worth being precise about. That detector groups clients by the server relaying them
 * and asks how many are reporting issues. It needs clients on the server to ask the question. When a
 * TURN server goes down completely, allocation fails: existing sessions drop, and new clients never
 * obtain a relay candidate through it at all, so they are never attributed to it. The server's
 * population goes to zero and the health detector falls silent for the worst possible reason — it
 * has nobody left to ask. Degradation makes clients unhappy; an outage makes them *disappear*.
 *
 * So the signal here is absence, measured against the server's own recent peak:
 *
 * - clients gone entirely (their relayed peer connections closed, or they re-negotiated onto a
 *   different path), plus
 * - clients still attributed to the server whose ICE or connection state is `disconnected` /
 *   `failed` / `closed` — the ones mid-collapse, which is what you catch if you look during the
 *   outage rather than after it.
 *
 * ### The control group is the whole design
 *
 * Absence is a dangerous signal: a call ending, everyone going home at 6pm, a fleet-wide network
 * event, and the observer itself shutting down all produce exactly the same collapse. The detector
 * therefore refuses to blame a server unless clients **not** relayed through it are demonstrably
 * still connected — `requireControlGroup`, on by default. "Everyone on `turn-eu-1` vanished" is
 * ambiguous; "everyone on `turn-eu-1` vanished while 200 clients elsewhere are fine" is an outage.
 *
 * That comparison is only available to something watching every call at once, which is why this is
 * an observer-level detector raising `observer-issue` — one alert for the fleet, not one per
 * abandoned call.
 *
 * ### Caveats worth knowing before you tune it
 *
 * Clients that fail over cleanly to a second TURN server still count as lost here, which is
 * correct — the server did stop serving them — but it means a well-configured fleet with automatic
 * failover reports outages that users never felt. That is the intended behaviour: the failover
 * worked *and* the server is down are both true, and you want to know the second one.
 *
 * A genuinely quiet server (last call of the day ends) is suppressed by the control group, not by
 * the collapse test. If you run a small deployment where the control group is routinely below
 * `minControlGroupClients`, this detector will stay quiet — prefer alerting on your TURN server's
 * own health checks there, since a handful of clients cannot distinguish these cases.
 */
export class TurnServerOutageDetector implements Detector {
	public static readonly NAME = 'turn-server-outage-detector';

	public readonly name = TurnServerOutageDetector.NAME;

	private readonly _config: TurnServerOutageDetectorConfig;

	/** serverUrl -> recent population observations, used to derive the windowed peak. */
	private readonly _peaks = new Map<string, PeakEntry[]>();
	private readonly _streaks = new Map<string, number>();
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly _observer: Observer,
		config: Partial<TurnServerOutageDetectorConfig> = {},
	) {
		this._config = {
			minClientsAtPeak: 5,
			// an outage is near-total by definition; partial degradation is the health detector's question
			lossRatioThreshold: 0.8,
			peakWindowMs: 120_000,
			// absence without a control group is just quiet
			requireControlGroup: true,
			minControlGroupClients: 5,
			controlGroupHealthyRatio: 0.7,
			consecutiveTicks: 2,
			// one event, not one per tick
			cooldownMs: 300_000,
			...config,
		};
	}

	public update(): void {
		const now = Date.now();
		const servers = [ ...this._observer.observedTURN.servers ];

		// Per-server populations first: the control group for one server is every *other* server's
		// clients plus the non-relayed ones, so all of them have to be known up front.
		const populations = new Map<string, { healthy: Set<string>, broken: Set<string> }>();

		for (const [ serverUrl, server ] of servers) {
			populations.set(serverUrl, this._populationOf(server.observedPeerConnections));
		}

		for (const [ serverUrl, population ] of populations) {
			const live = population.healthy.size;
			const broken = population.broken.size;
			const peak = this._recordAndPeak(serverUrl, live + broken, now);

			if (peak < this._config.minClientsAtPeak) {
				this._streaks.delete(serverUrl);
				continue;
			}

			// Everything the server has lost: gone entirely, or still attributed but not connected.
			const lost = Math.max(0, peak - live);
			const lossRatio = lost / peak;

			if (lossRatio < this._config.lossRatioThreshold) {
				this._streaks.delete(serverUrl);
				continue;
			}

			const control = this._controlGroup(serverUrl, populations);

			if (this._config.requireControlGroup) {
				if (control.total < this._config.minControlGroupClients) {
					this._streaks.delete(serverUrl);
					continue;
				}
				if (control.healthyRatio < this._config.controlGroupHealthyRatio) {
					// Everyone is having a bad time; this is not one server's fault.
					this._streaks.delete(serverUrl);
					continue;
				}
			}

			const ticks = (this._streaks.get(serverUrl) ?? 0) + 1;

			this._streaks.set(serverUrl, ticks);

			if (ticks < this._config.consecutiveTicks) continue;
			if (now - (this._lastRaisedAt.get(serverUrl) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(serverUrl, now);

			this._observer.addIssue({
				type: TurnServerOutageTypes.turnServerOutage,
				timestamp: now,
				payload: {
					serverUrl,
					peakClients: peak,
					currentClients: live,
					disruptedClients: broken,
					lostClients: lost,
					lossRatio,
					disruptedClientIds: [ ...population.broken ],
					controlGroupClients: control.total,
					controlGroupHealthyClients: control.healthy,
					controlGroupHealthyRatio: control.healthyRatio,
					peakWindowMs: this._config.peakWindowMs,
				},
			});
		}

		// Forget servers that are no longer known at all.
		for (const key of [ ...this._peaks.keys() ]) {
			if (populations.has(key)) continue;
			this._peaks.delete(key);
			this._streaks.delete(key);
		}
	}

	public close(): void {
		this._peaks.clear();
		this._streaks.clear();
		this._lastRaisedAt.clear();
	}

	/** Distinct clients on a server, split by whether their relayed transport is actually up. */
	private _populationOf(peerConnections: Map<string, ObservedPeerConnection>) {
		const healthy = new Set<string>();
		const broken = new Set<string>();

		for (const peerConnection of peerConnections.values()) {
			const clientId = peerConnection.client.clientId;
			const isBroken = peerConnection.closed
				|| brokenStates.has(peerConnection.iceConnectionState ?? '')
				|| brokenStates.has(peerConnection.connectionState ?? '');

			if (isBroken) broken.add(clientId);
			else healthy.add(clientId);
		}

		// A client with one healthy relayed transport is not a casualty, even if another of its
		// peer connections is down.
		for (const clientId of healthy) broken.delete(clientId);

		return { healthy, broken };
	}

	/** Record this tick's population and return the peak across `peakWindowMs`. */
	private _recordAndPeak(serverUrl: string, clients: number, now: number): number {
		const entries = this._peaks.get(serverUrl) ?? [];
		const cutoff = now - this._config.peakWindowMs;
		const kept = entries.filter((e) => cutoff <= e.at);

		kept.push({ clients, at: now });
		this._peaks.set(serverUrl, kept);

		return kept.reduce((max, e) => Math.max(max, e.clients), 0);
	}

	/**
	 * Everyone *not* relayed through `serverUrl`: clients on other TURN servers plus every client
	 * the observer knows about that isn't relayed at all. The healthy share of that group is what
	 * separates "this server broke" from "everything broke".
	 */
	private _controlGroup(serverUrl: string, populations: Map<string, { healthy: Set<string>, broken: Set<string> }>) {
		const healthy = new Set<string>();
		const broken = new Set<string>();

		for (const [ otherUrl, population ] of populations) {
			if (otherUrl === serverUrl) continue;
			for (const clientId of population.healthy) healthy.add(clientId);
			for (const clientId of population.broken) broken.add(clientId);
		}

		// Non-relayed clients count as control too: they are the cleanest evidence that the
		// observer is still receiving samples and the world at large is fine.
		const onThisServer = populations.get(serverUrl);

		for (const call of this._observer.observedCalls.values()) {
			for (const client of call.observedClients.values()) {
				if (onThisServer?.healthy.has(client.clientId) || onThisServer?.broken.has(client.clientId)) continue;
				if (broken.has(client.clientId)) continue;
				healthy.add(client.clientId);
			}
		}

		for (const clientId of healthy) broken.delete(clientId);

		const total = healthy.size + broken.size;

		return {
			total,
			healthy: healthy.size,
			healthyRatio: 0 < total ? healthy.size / total : 0,
		};
	}
}
