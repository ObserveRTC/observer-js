import type { Detector } from './Detector';
import type { Observer } from '../Observer';
import type { ObservedPeerConnection } from '../ObservedPeerConnection';

export const TurnServerHealthTypes = {
	/** One TURN server's clients are in trouble while other servers' clients are fine. */
	turnServerDegraded: 'TURN_SERVER_DEGRADED',
} as const;

export type TurnServerHealthDetectorConfig = {

	/** Minimum clients on a server before a ratio is meaningful. Default `5`. */
	minClientsPerServer: number;

	/** Fraction of a server's clients that must have an open issue. Default `0.5`. */
	degradedRatioThreshold: number;

	/**
	 * Which client issue types count as "in trouble". Empty (default) means **any** open issue —
	 * appropriate here, because the question is not *what* is wrong with each client but whether
	 * trouble clusters on one relay.
	 */
	issueTypes: string[];

	/** Consecutive ticks the condition must hold before raising. Default `2`. */
	consecutiveTicks: number;

	/** Re-arm time (ms) before raising again for the same server. Default `60_000`. */
	cooldownMs: number;
};

/** The per-server view this detector builds. */
export type TurnServerHealth = {
	serverUrl: string;

	/** Distinct clients whose media is relayed through this server. */
	clients: number;

	/** Of those, how many currently have at least one open issue. */
	degradedClients: number;
	degradedRatio: number;
	affectedClientIds: string[];

	/** The open issue types seen on this server's clients, most common first. */
	issueTypes: string[];
};

/**
 * An **observer-level** detector that groups relayed clients by the TURN server carrying them and
 * compares the servers against each other.
 *
 * Counting TURN usage is not useful on its own; knowing that `turn-eu-1` has 22 of 30 clients in
 * trouble while `turn-eu-2` has 1 of 34 is. Because the comparison spans calls it lives on
 * `observer.detectors` and raises `observer-issue` — one actionable alert instead of fifty
 * per-client ones. Each finding carries the other servers' ratios as context, since "half the
 * clients here are unhappy" only means something relative to the rest of the fleet.
 *
 * Whether a client is in trouble comes from **its own reported issues**, not from thresholds applied
 * here. The client already decides that far better than a server-side rule could; the value this
 * adds is the grouping — the dimension no endpoint can see.
 *
 * For a relay that has stopped serving entirely, see `TurnServerOutageDetector`: this detector needs
 * clients *on* the server to ask how many are unhappy, and an outage takes them away.
 */
export class TurnServerHealthDetector implements Detector {
	public readonly name = 'turn-server-health-detector';

	private readonly _config: TurnServerHealthDetectorConfig;
	private readonly _streaks = new Map<string, number>();
	private readonly _lastRaisedAt = new Map<string, number>();

	/** The per-server rollup computed on the most recent `update()`. */
	public lastServers: TurnServerHealth[] = [];

	public constructor(
		private readonly _observer: Observer,
		config: TurnServerHealthDetectorConfig,
	) {
		this._config = config;
	}

	public update(): void {
		const now = Date.now();
		const wanted = new Set(this._config.issueTypes);
		const issuesByClientId = new Map<string, string[]>();

		for (const issue of this._observer.issueIndex.all) {
			if (0 < wanted.size && !wanted.has(issue.type)) continue;

			const types = issuesByClientId.get(issue.clientId);

			if (types) types.push(issue.type);
			else issuesByClientId.set(issue.clientId, [ issue.type ]);
		}

		// Compute every server first, so each finding can carry the full cross-server comparison.
		this.lastServers = [ ...this._observer.observedTURN.servers ]
			.map(([ serverUrl, server ]) => this._serverHealth(serverUrl, server.observedPeerConnections, issuesByClientId));

		for (const health of this.lastServers) {
			const serverUrl = health.serverUrl;

			if (health.clients < this._config.minClientsPerServer || health.degradedRatio < this._config.degradedRatioThreshold) {
				this._streaks.delete(serverUrl);
				continue;
			}

			const ticks = (this._streaks.get(serverUrl) ?? 0) + 1;

			this._streaks.set(serverUrl, ticks);

			if (ticks < this._config.consecutiveTicks) continue;
			if (now - (this._lastRaisedAt.get(serverUrl) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(serverUrl, now);

			const otherServers = this.lastServers
				.filter((server) => server.serverUrl !== serverUrl)
				.map((server) => ({ serverUrl: server.serverUrl, clients: server.clients, degradedRatio: server.degradedRatio }));

			this._observer.addIssue({
				type: TurnServerHealthTypes.turnServerDegraded,
				timestamp: now,
				payload: { type: TurnServerHealthTypes.turnServerDegraded, ...health, otherServers },
			});
		}

		for (const serverUrl of [ ...this._streaks.keys() ]) {
			if (!this.lastServers.some((server) => server.serverUrl === serverUrl)) this._streaks.delete(serverUrl);
		}
	}

	public close(): void {
		this._streaks.clear();
		this._lastRaisedAt.clear();
		this.lastServers = [];
	}

	private _serverHealth(
		serverUrl: string,
		peerConnections: Map<string, ObservedPeerConnection>,
		issuesByClientId: Map<string, string[]>,
	): TurnServerHealth {
		// A client can hold several relayed peer connections; the unit of comparison is the client.
		const clientIds = new Set<string>();
		const affectedClientIds = new Set<string>();
		const typeCounts = new Map<string, number>();

		for (const peerConnection of peerConnections.values()) {
			const clientId = peerConnection.client.clientId;

			clientIds.add(clientId);

			const types = issuesByClientId.get(clientId);

			if (!types) continue;

			affectedClientIds.add(clientId);
			for (const type of types) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
		}

		return {
			serverUrl,
			clients: clientIds.size,
			degradedClients: affectedClientIds.size,
			degradedRatio: 0 < clientIds.size ? affectedClientIds.size / clientIds.size : 0,
			affectedClientIds: [ ...affectedClientIds ],
			issueTypes: [ ...typeCounts.entries() ].sort((a, b) => b[1] - a[1]).map(([ type ]) => type),
		};
	}
}
