import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import type { ObservedInboundTrack } from '../ObservedInboundTrack';
import type { ObservedCall } from '../ObservedCall';
import { StatsSummary, summarize } from './stats';

/**
 * Thresholds deciding when a single receiver counts as "degraded". A receiver is degraded when it
 * trips **any** of these in the current tick.
 */
export type ReceiverHealthThresholds = {

	/** Fraction of packets lost in the tick (0..1). */
	fractionLost: number;

	/** Freezes observed in the tick. */
	freezeCount: number;

	/** Fraction of received frames dropped before rendering (0..1). */
	framesDroppedRatio: number;

	/** Fraction of received audio samples concealed (0..1). */
	concealmentRatio: number;

	/** Mean jitter-buffer delay of the tick (ms). */
	jitterBufferDelayInMs: number;

	/** Round-trip time reported for the receiving peer connection (ms). */
	rttInMs: number;
};

export const defaultReceiverHealthThresholds: ReceiverHealthThresholds = {
	fractionLost: 0.03,
	freezeCount: 1,
	framesDroppedRatio: 0.05,
	concealmentRatio: 0.1,
	jitterBufferDelayInMs: 500,
	rttInMs: 400,
};

/** The per-receiver view the aggregator builds for one subscribed track. */
export type ReceiverDistributionEntry = {
	observedInboundTrack: ObservedInboundTrack;
	clientId: string;
	peerConnectionId: string;
	degraded: boolean;

	/** Why it was marked degraded (empty when healthy). */
	reasons: string[];

	bitrate: number;
	fractionLost?: number;
	jitter?: number;
	rttInMs?: number;
	jitterBufferDelayInMs?: number;
	concealmentRatio?: number;
	framesDroppedRatio?: number;
	deltaFreezeCount: number;
	deltaPliCount: number;
	deltaNackCount: number;
	deltaPacketsReceived: number;
};

/** The publisher side of the distribution. */
export type PublisherDistributionEntry = {
	observedOutboundTrack: ObservedOutboundTrack;
	clientId: string;
	peerConnectionId: string;

	/** `true` when the publisher's own egress looks fine (so degradation is downstream). */
	healthy: boolean;
	reasons: string[];

	bitrate: number;

	/** Loss reported back by the SFU/remote via RTCP (0..1). */
	remoteFractionLost?: number;
	remoteRttInMs?: number;
	qualityLimitationReason?: string;
	deltaPacketsSent: number;
};

/**
 * One published track and everything observed about how it was delivered to its subscribers.
 * This is the primitive most cross-client detectors are built on.
 */
export type ObservedTrackDistribution = {
	trackId: string;
	kind: string;
	publisher: PublisherDistributionEntry;
	receivers: ReceiverDistributionEntry[];

	numberOfReceivers: number;
	numberOfHealthyReceivers: number;
	numberOfDegradedReceivers: number;

	/** degradedReceivers / receivers (0..1); `0` when there are no receivers. */
	degradedRatio: number;

	/** Distribution summaries across receivers (undefined when no receiver reported the metric). */
	bitrate?: StatsSummary;
	fractionLost?: StatsSummary;
	jitter?: StatsSummary;
	rttInMs?: StatsSummary;
	jitterBufferDelayInMs?: StatsSummary;
	concealmentRatio?: StatsSummary;

	/** Fan-out counters: how many receivers saw the symptom, and the total across them. */
	freezes: { affectedReceivers: number, total: number };
	plis: { affectedReceivers: number, total: number };
	concealment: { affectedReceivers: number };
};

/**
 * Builds {@link ObservedTrackDistribution}s by walking
 * `ObservedOutboundTrack.remoteInboundTracks` — the publisher → subscribers links maintained by a
 * `RemoteTrackResolver`. Without a configured resolver there are no links and the aggregator
 * yields nothing.
 *
 * It is stateless per call: build it once and call `aggregate()` on each `call.update()`.
 */
export class TrackDistributionAggregator {
	public constructor(
		private readonly _call: ObservedCall,
		public readonly thresholds: ReceiverHealthThresholds = defaultReceiverHealthThresholds,
	) {
	}

	/** Aggregate every published track in the call that currently has linked subscribers. */
	public aggregate(): ObservedTrackDistribution[] {
		const result: ObservedTrackDistribution[] = [];

		for (const client of this._call.observedClients.values()) {
			for (const peerConnection of client.observedPeerConnections.values()) {
				for (const outboundTrack of peerConnection.observedOutboundTracks.values()) {
					const distribution = this.aggregateTrack(outboundTrack);

					if (distribution) result.push(distribution);
				}
			}
		}

		return result;
	}

	/** Aggregate a single published track, or `undefined` when it has no linked subscribers. */
	public aggregateTrack(outboundTrack: ObservedOutboundTrack): ObservedTrackDistribution | undefined {
		if (outboundTrack.remoteInboundTracks.size === 0) return undefined;

		const publisher = this._publisherEntry(outboundTrack);
		const receivers: ReceiverDistributionEntry[] = [];

		for (const inboundTrack of outboundTrack.remoteInboundTracks) {
			receivers.push(this._receiverEntry(inboundTrack));
		}

		const degraded = receivers.filter((receiver) => receiver.degraded);
		const collect = (pick: (r: ReceiverDistributionEntry) => number | undefined) =>
			summarize(receivers.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));

		return {
			trackId: outboundTrack.id,
			kind: outboundTrack.kind,
			publisher,
			receivers,
			numberOfReceivers: receivers.length,
			numberOfHealthyReceivers: receivers.length - degraded.length,
			numberOfDegradedReceivers: degraded.length,
			degradedRatio: 0 < receivers.length ? degraded.length / receivers.length : 0,

			bitrate: collect((r) => r.bitrate),
			fractionLost: collect((r) => r.fractionLost),
			jitter: collect((r) => r.jitter),
			rttInMs: collect((r) => r.rttInMs),
			jitterBufferDelayInMs: collect((r) => r.jitterBufferDelayInMs),
			concealmentRatio: collect((r) => r.concealmentRatio),

			freezes: {
				affectedReceivers: receivers.filter((r) => 0 < r.deltaFreezeCount).length,
				total: receivers.reduce((sum, r) => sum + r.deltaFreezeCount, 0),
			},
			plis: {
				affectedReceivers: receivers.filter((r) => 0 < r.deltaPliCount).length,
				total: receivers.reduce((sum, r) => sum + r.deltaPliCount, 0),
			},
			concealment: {
				affectedReceivers: receivers.filter((r) => this.thresholds.concealmentRatio <= (r.concealmentRatio ?? 0)).length,
			},
		};
	}

	private _publisherEntry(outboundTrack: ObservedOutboundTrack): PublisherDistributionEntry {
		const peerConnection = outboundTrack.getPeerConnection();
		const rtps = outboundTrack.getOutboundRtps() ?? [];

		let bitrate = 0;
		let deltaPacketsSent = 0;
		let remoteFractionLost: number | undefined;
		let remoteRttInMs: number | undefined;
		let qualityLimitationReason: string | undefined;

		for (const rtp of rtps) {
			bitrate += rtp.bitrate;
			deltaPacketsSent += rtp.deltaPacketsSent;

			if (rtp.remoteFractionLost !== undefined) {
				remoteFractionLost = Math.max(remoteFractionLost ?? 0, rtp.remoteFractionLost);
			}
			if (rtp.remoteRttInMs !== undefined) {
				remoteRttInMs = Math.max(remoteRttInMs ?? 0, rtp.remoteRttInMs);
			}
			if (rtp.qualityLimitationReason && rtp.qualityLimitationReason !== 'none') {
				qualityLimitationReason = rtp.qualityLimitationReason;
			}
		}

		const reasons: string[] = [];

		if (this.thresholds.fractionLost < (remoteFractionLost ?? 0)) reasons.push('remote-fraction-lost');
		if (this.thresholds.rttInMs < (remoteRttInMs ?? 0)) reasons.push('remote-rtt');
		if (qualityLimitationReason) reasons.push(`quality-limited-${qualityLimitationReason}`);
		if (outboundTrack.muted !== true && deltaPacketsSent === 0) reasons.push('no-packets-sent');

		return {
			observedOutboundTrack: outboundTrack,
			clientId: peerConnection?.client.clientId ?? 'unknown',
			peerConnectionId: peerConnection?.peerConnectionId ?? 'unknown',
			healthy: reasons.length === 0,
			reasons,
			bitrate,
			remoteFractionLost,
			remoteRttInMs,
			qualityLimitationReason,
			deltaPacketsSent,
		};
	}

	private _receiverEntry(inboundTrack: ObservedInboundTrack): ReceiverDistributionEntry {
		const peerConnection = inboundTrack.getPeerConnection();
		const rtp = inboundTrack.getInboundRtp();
		const reasons: string[] = [];

		const fractionLost = rtp?.fractionLost;
		const deltaFreezeCount = rtp?.deltaFreezeCount ?? 0;
		const framesDroppedRatio = rtp?.framesDroppedRatio;
		const concealmentRatio = rtp?.concealmentRatio;
		const jitterBufferDelayInMs = rtp?.jitterBufferDelayInMs;
		const rttInMs = peerConnection?.currentRttInMs;

		if (this.thresholds.fractionLost < (fractionLost ?? 0)) reasons.push('fraction-lost');
		if (this.thresholds.freezeCount <= deltaFreezeCount) reasons.push('freezes');
		if (this.thresholds.framesDroppedRatio < (framesDroppedRatio ?? 0)) reasons.push('frames-dropped');
		if (this.thresholds.concealmentRatio < (concealmentRatio ?? 0)) reasons.push('concealment');
		if (this.thresholds.jitterBufferDelayInMs < (jitterBufferDelayInMs ?? 0)) reasons.push('jitter-buffer-delay');
		if (this.thresholds.rttInMs < (rttInMs ?? 0)) reasons.push('rtt');

		return {
			observedInboundTrack: inboundTrack,
			clientId: peerConnection?.client.clientId ?? 'unknown',
			peerConnectionId: peerConnection?.peerConnectionId ?? 'unknown',
			degraded: 0 < reasons.length,
			reasons,
			bitrate: rtp?.bitrate ?? 0,
			fractionLost,
			jitter: rtp?.jitter,
			rttInMs,
			jitterBufferDelayInMs,
			concealmentRatio,
			framesDroppedRatio,
			deltaFreezeCount,
			deltaPliCount: rtp?.deltaPliCount ?? 0,
			deltaNackCount: rtp?.deltaNackCount ?? 0,
			deltaPacketsReceived: rtp?.deltaReceivedPackets ?? 0,
		};
	}
}
