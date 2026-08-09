import type { ObservedCall } from '../ObservedCall';
import type { ObservedClient } from '../ObservedClient';
import { StatsSummary, summarize } from './stats';

/** Thresholds deciding when a client counts as degraded on the receiving / sending side. */
export type ClientHealthThresholds = {

	/** Inbound loss fraction across the client's received streams (0..1). */
	inboundFractionLost: number;

	/** Loss fraction reported back about the client's sent streams via RTCP (0..1). */
	outboundFractionLost: number;

	/** Round-trip time (ms). */
	rttInMs: number;

	/** Freezes observed across the client's inbound video in the tick. */
	freezeCount: number;

	/** Concealment fraction across the client's inbound audio (0..1). */
	concealmentRatio: number;
};

export const defaultClientHealthThresholds: ClientHealthThresholds = {
	inboundFractionLost: 0.03,
	outboundFractionLost: 0.03,
	rttInMs: 400,
	freezeCount: 1,
	concealmentRatio: 0.1,
};

/** The per-client health view, split by direction. */
export type ClientHealth = {
	observedClient: ObservedClient;
	clientId: string;

	/** Receiving (download) side is impaired. */
	inboundDegraded: boolean;

	/** Sending (upload) side is impaired. */
	outboundDegraded: boolean;

	/** `inboundDegraded || outboundDegraded`. */
	degraded: boolean;
	reasons: string[];

	inboundFractionLost?: number;
	outboundFractionLost?: number;
	rttInMs?: number;
	deltaFreezeCount: number;
	concealmentRatio?: number;

	/** Quality-limitation reasons seen on this client's outbound video ('cpu' | 'bandwidth' | …). */
	qualityLimitationReasons: string[];

	usingTURN: boolean;
	usingTCP: boolean;
};

/** Call-level rollup of the per-client health, using percentiles rather than means. */
export type CallHealth = {
	callId: string;
	clients: ClientHealth[];

	numberOfClients: number;
	numberOfDegradedClients: number;
	numberOfInboundDegradedClients: number;
	numberOfOutboundDegradedClients: number;

	/** degradedClients / clients (0..1). */
	degradedRatio: number;
	inboundDegradedRatio: number;
	outboundDegradedRatio: number;

	rttInMs?: StatsSummary;
	inboundFractionLost?: StatsSummary;
	concealmentRatio?: StatsSummary;

	/** How many clients reported each quality-limitation reason on their outbound video. */
	qualityLimitation: { cpu: number, bandwidth: number, other: number };

	freezes: { affectedClients: number, total: number };
};

/**
 * Aggregates a call along the **client** axis (as `TrackDistributionAggregator` does along the
 * publisher→subscriber axis): per-client health split into sending vs receiving, plus percentile
 * rollups and "affected ratio" counts for the whole call.
 *
 * Build once per call and call `aggregate()` on each `call.update()`.
 */
export class CallHealthAggregator {
	public constructor(
		private readonly _call: ObservedCall,
		public readonly thresholds: ClientHealthThresholds = defaultClientHealthThresholds,
	) {
	}

	public aggregate(): CallHealth {
		const clients: ClientHealth[] = [];

		for (const client of this._call.observedClients.values()) {
			clients.push(this._clientHealth(client));
		}

		const degraded = clients.filter((c) => c.degraded);
		const inboundDegraded = clients.filter((c) => c.inboundDegraded);
		const outboundDegraded = clients.filter((c) => c.outboundDegraded);
		const collect = (pick: (c: ClientHealth) => number | undefined) =>
			summarize(clients.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));

		const qualityLimitation = { cpu: 0, bandwidth: 0, other: 0 };

		for (const client of clients) {
			if (client.qualityLimitationReasons.includes('cpu')) qualityLimitation.cpu += 1;
			if (client.qualityLimitationReasons.includes('bandwidth')) qualityLimitation.bandwidth += 1;
			if (client.qualityLimitationReasons.some((r) => r !== 'cpu' && r !== 'bandwidth')) qualityLimitation.other += 1;
		}

		const ratio = (n: number) => (0 < clients.length ? n / clients.length : 0);

		return {
			callId: this._call.callId,
			clients,
			numberOfClients: clients.length,
			numberOfDegradedClients: degraded.length,
			numberOfInboundDegradedClients: inboundDegraded.length,
			numberOfOutboundDegradedClients: outboundDegraded.length,
			degradedRatio: ratio(degraded.length),
			inboundDegradedRatio: ratio(inboundDegraded.length),
			outboundDegradedRatio: ratio(outboundDegraded.length),
			rttInMs: collect((c) => c.rttInMs),
			inboundFractionLost: collect((c) => c.inboundFractionLost),
			concealmentRatio: collect((c) => c.concealmentRatio),
			qualityLimitation,
			freezes: {
				affectedClients: clients.filter((c) => 0 < c.deltaFreezeCount).length,
				total: clients.reduce((sum, c) => sum + c.deltaFreezeCount, 0),
			},
		};
	}

	private _clientHealth(client: ObservedClient): ClientHealth {
		let deltaFreezeCount = 0;
		let concealedSamples = 0;
		let receivedSamples = 0;
		let remoteLostPackets = 0;
		let remoteSentPackets = 0;
		const qualityLimitationReasons = new Set<string>();

		for (const peerConnection of client.observedPeerConnections.values()) {
			for (const rtp of peerConnection.observedInboundRtps.values()) {
				deltaFreezeCount += rtp.deltaFreezeCount;
				concealedSamples += rtp.deltaConcealedSamples;
				receivedSamples += rtp.deltaReceivedSamples;
			}
			for (const rtp of peerConnection.observedOutboundRtps.values()) {
				if (rtp.qualityLimitationReason && rtp.qualityLimitationReason !== 'none') {
					qualityLimitationReasons.add(rtp.qualityLimitationReason);
				}
				// Loss about our *sent* streams comes back in the receiver report.
				if (rtp.remoteFractionLost !== undefined) {
					remoteLostPackets += rtp.remoteFractionLost * rtp.deltaPacketsSent;
					remoteSentPackets += rtp.deltaPacketsSent;
				}
			}
		}

		const inboundTotal = client.deltaInboundPacketsLost + client.deltaInboundPacketsReceived;
		const inboundFractionLost = 0 < inboundTotal ? client.deltaInboundPacketsLost / inboundTotal : undefined;
		const outboundFractionLost = 0 < remoteSentPackets ? remoteLostPackets / remoteSentPackets : undefined;
		const concealmentRatio = 0 < receivedSamples ? concealedSamples / receivedSamples : undefined;
		const rttInMs = client.currentAvgRttInMs;

		const reasons: string[] = [];

		if (this.thresholds.inboundFractionLost < (inboundFractionLost ?? 0)) reasons.push('inbound-fraction-lost');
		if (this.thresholds.freezeCount <= deltaFreezeCount) reasons.push('freezes');
		if (this.thresholds.concealmentRatio < (concealmentRatio ?? 0)) reasons.push('concealment');
		if (this.thresholds.rttInMs < (rttInMs ?? 0)) reasons.push('rtt');

		const outboundReasons: string[] = [];

		if (this.thresholds.outboundFractionLost < (outboundFractionLost ?? 0)) outboundReasons.push('outbound-fraction-lost');
		if (0 < qualityLimitationReasons.size) {
			outboundReasons.push(...[ ...qualityLimitationReasons ].map((r) => `quality-limited-${r}`));
		}

		const inboundDegraded = 0 < reasons.length;
		const outboundDegraded = 0 < outboundReasons.length;

		return {
			observedClient: client,
			clientId: client.clientId,
			inboundDegraded,
			outboundDegraded,
			degraded: inboundDegraded || outboundDegraded,
			reasons: [ ...reasons, ...outboundReasons ],
			inboundFractionLost,
			outboundFractionLost,
			rttInMs,
			deltaFreezeCount,
			concealmentRatio,
			qualityLimitationReasons: [ ...qualityLimitationReasons ],
			usingTURN: client.usingTURN,
			usingTCP: client.usingTCP,
		};
	}
}
