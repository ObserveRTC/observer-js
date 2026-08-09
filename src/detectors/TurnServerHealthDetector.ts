import type { Detector } from './Detector';
import type { Observer } from '../Observer';
import type { ObservedPeerConnection } from '../ObservedPeerConnection';
import { StatsSummary, summarize } from './../utils/stats';

export const TurnServerHealthTypes = {
	/** One TURN server's clients are degraded while other servers' clients are fine. */
	turnServerDegraded: 'TURN_SERVER_DEGRADED',
} as const;

export type TurnServerHealthDetectorConfig = {

	/** Minimum clients on a server before a ratio is meaningful. Default `5`. */
	minClientsPerServer: number;

	/** Fraction of a server's clients that must be degraded. Default `0.5`. */
	degradedRatioThreshold: number;

	/** RTT (ms) above which a relayed peer connection counts as degraded. Default `400`. */
	rttInMs: number;

	/** Inbound loss fraction above which a relayed peer connection counts as degraded. Default `0.03`. */
	fractionLost: number;

	/** Consecutive ticks the condition must hold before raising. Default `2`. */
	consecutiveTicks: number;

	/** Re-arm time (ms) before raising again for the same server. Default `60_000`. */
	cooldownMs: number;
};

const defaultConfig: TurnServerHealthDetectorConfig = {
	minClientsPerServer: 5,
	degradedRatioThreshold: 0.5,
	rttInMs: 400,
	fractionLost: 0.03,
	consecutiveTicks: 2,
	cooldownMs: 60_000,
};

/** The per-server view this detector builds. */
export type TurnServerHealth = {
	serverUrl: string;
	peerConnections: number;
	degradedPeerConnections: number;
	degradedRatio: number;
	rttInMs?: StatsSummary;
	fractionLost?: StatsSummary;
	affectedClientIds: string[];
};

/**
 * An **observer-level** detector that groups relayed peer connections by the TURN server carrying
 * them and compares the servers against each other.
 *
 * Counting TURN usage is not useful on its own; knowing that `turn-eu-1` has 22 of 30 clients in
 * trouble while `turn-eu-2` has 1 of 34 is. Because the comparison spans calls, it lives on
 * `observer.detectors` and raises `observer-issue` — a single actionable alert instead of fifty
 * per-client ones.
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
		config: Partial<TurnServerHealthDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
	}

	public update(): void {
		const now = Date.now();

		// Compute every server's health FIRST, so each finding can carry the full cross-server
		// comparison (evaluating while building the list would leave the first server without peers).
		this.lastServers = [ ...this._observer.observedTURN.servers ]
			.map(([ serverUrl, server ]) => this._serverHealth(serverUrl, server.observedPeerConnections));

		for (const health of this.lastServers) {
			const serverUrl = health.serverUrl;

			if (health.peerConnections < this._config.minClientsPerServer) {
				this._streaks.delete(serverUrl);
				continue;
			}
			if (health.degradedRatio < this._config.degradedRatioThreshold) {
				this._streaks.delete(serverUrl);
				continue;
			}

			const ticks = (this._streaks.get(serverUrl) ?? 0) + 1;

			this._streaks.set(serverUrl, ticks);

			if (ticks < this._config.consecutiveTicks) continue;
			if (now - (this._lastRaisedAt.get(serverUrl) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(serverUrl, now);

			// Comparison context: how the other servers are doing right now.
			const peers = this.lastServers
				.filter((s) => s.serverUrl !== serverUrl)
				.map((s) => ({ serverUrl: s.serverUrl, peerConnections: s.peerConnections, degradedRatio: s.degradedRatio }));

			this._observer.addIssue({
				type: TurnServerHealthTypes.turnServerDegraded,
				timestamp: now,
				payload: JSON.stringify({ type: TurnServerHealthTypes.turnServerDegraded, ...health, otherServers: peers }),
			});
		}

		// forget servers that disappeared
		for (const serverUrl of [ ...this._streaks.keys() ]) {
			if (!this.lastServers.some((s) => s.serverUrl === serverUrl)) this._streaks.delete(serverUrl);
		}
	}

	public close(): void {
		this._streaks.clear();
		this._lastRaisedAt.clear();
	}

	private _serverHealth(serverUrl: string, peerConnections: Map<string, ObservedPeerConnection>): TurnServerHealth {
		const rtts: number[] = [];
		const losses: number[] = [];
		const affectedClientIds = new Set<string>();
		let degraded = 0;

		for (const peerConnection of peerConnections.values()) {
			const rttInMs = peerConnection.currentRttInMs;
			let lostPackets = 0;
			let receivedPackets = 0;

			for (const rtp of peerConnection.observedInboundRtps.values()) {
				lostPackets += rtp.deltaLostPackets;
				receivedPackets += rtp.deltaReceivedPackets;
			}

			const total = lostPackets + receivedPackets;
			const fractionLost = 0 < total ? lostPackets / total : undefined;

			if (rttInMs !== undefined) rtts.push(rttInMs);
			if (fractionLost !== undefined) losses.push(fractionLost);

			if (this._config.rttInMs < (rttInMs ?? 0) || this._config.fractionLost < (fractionLost ?? 0)) {
				degraded += 1;
				affectedClientIds.add(peerConnection.client.clientId);
			}
		}

		const count = peerConnections.size;

		return {
			serverUrl,
			peerConnections: count,
			degradedPeerConnections: degraded,
			degradedRatio: 0 < count ? degraded / count : 0,
			rttInMs: summarize(rtts),
			fractionLost: summarize(losses),
			affectedClientIds: [ ...affectedClientIds ],
		};
	}
}
