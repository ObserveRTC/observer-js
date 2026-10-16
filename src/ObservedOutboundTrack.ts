import { CalculatedScore } from './scores/CalculatedScore';
import { MediaKind } from './common/types';
import { OutboundTrackSample } from './schema/ClientSample';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { ObservedOutboundRtp } from './ObservedOutboundRtp';
import { ObservedMediaSource } from './ObservedMediaSource';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { pushFinite } from './common/utils';
import { median, StatsSummary, summarize } from './utils/stats';
import type { AudioInputDevice } from './schema/ClientMetaTypes';
import { Detectors } from '.';

/** The per-receiver view the aggregator builds for one subscribed track. */
export type PublishedTrackReceivingDistributionEntry = {
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

export class ObservedOutboundTrack implements OutboundTrackSample {
	private _visited = false;
	public appData?: Record<string, unknown>;

	public readonly remoteInboundTracks = new Set<ObservedInboundTrack>();

	public readonly detectors = new Detectors();

	// only set if the track is being received by at least one subscriber, otherwise undefined
	// which means the remote track resolver has to be set up to know if the track is unconsumed or not
	public receivingDistribution?: PublishedTrackReceivingDistributionEntry;

	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};

	public addedAt?: number | undefined;
	public removedAt?: number | undefined;

	public muted?: boolean;
	public attachments?: Record<string, unknown> | undefined;

	public degradedReasons?: string[] | undefined;
	public bitrate?: number | undefined;
	public deltaPacketsSent?: number | undefined;
	public remoteFractionLost?: number | undefined;
	public remoteRttInMs?: number | undefined;
	public qualityLimitationReason?: string | undefined;

	/**
	 * This audio track's RMS level (0..1) over the latest tick — how loud the publisher was sending.
	 * Taken from the publisher's own `media-source` when it reports one (Chrome, Safari), otherwise
	 * the median of what its receivers heard ({@link receivedRmsAudioLevel}), which is what makes it
	 * available for Firefox publishers too. `undefined` for video, or when neither is known.
	 * {@link rmsAudioLevelSource} says which one it is.
	 */
	public rmsAudioLevel?: number;
	public rmsAudioLevelSource?: 'media-source' | 'receivers';

	/**
	 * Median RMS level (0..1) of this track across the receivers that played it out, each over its own
	 * latest tick. Needs a `RemoteTrackResolver`: without links there are no receivers to ask.
	 */
	public receivedRmsAudioLevel?: number;

	constructor(
		public timestamp: number,
		public readonly id: string,
		public readonly kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
		private readonly _mediaSource?: ObservedMediaSource,
	) {
		// no-op
	}

	public get score() {
		return this.calculatedScore.value;
	}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public get degraded() {
		return (this.degradedReasons?.length ?? 0) > 0;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	/** The outbound RTPs of this track's media source, looked up on every call. */
	public getOutboundRtps(): ObservedOutboundRtp[] | undefined {
		const mediaSource = this._mediaSource;

		if (!mediaSource) return undefined;

		return [ ...this._peerConnection.observedOutboundRtps.values() ].filter((rtp) => rtp.mediaSourceId === mediaSource.id);
	}

	public getMediaSource() {
		return this._mediaSource;
	}

	/** The capture device behind this track, when the client sent `AUDIO_INPUT_DEVICE` metadata for it. */
	public get audioInputDevice(): AudioInputDevice | undefined {
		return this._peerConnection.client.audioInputDevices.get(this.id);
	}

	public update(stats: OutboundTrackSample): void {
		this._visited = true;

		this.timestamp = stats.timestamp;
		this.calculatedScore.value = stats.score;
		this.attachments = stats.attachments;

		// update comes after outbound rtps are updated, so we can accumulate stuffs
		this.bitrate = undefined;
		this.deltaPacketsSent = undefined;
		this.remoteFractionLost = undefined;
		this.remoteRttInMs = undefined;
		this.qualityLimitationReason = undefined;

		for (const rtp of this.getOutboundRtps() ?? []) {
			this.bitrate = (this.bitrate ?? 0) + rtp.bitrate;
			this.deltaPacketsSent = (this.deltaPacketsSent ?? 0) + rtp.deltaPacketsSent;

			if (rtp.remoteFractionLost !== undefined) {
				this.remoteFractionLost = Math.max(this.remoteFractionLost ?? 0, rtp.remoteFractionLost);
			}
			if (rtp.remoteRttInMs !== undefined) {
				this.remoteRttInMs = Math.max(this.remoteRttInMs ?? 0, rtp.remoteRttInMs);
			}
			if (rtp.qualityLimitationReason && rtp.qualityLimitationReason !== 'none') {
				this.qualityLimitationReason = rtp.qualityLimitationReason;
			}
		}

		const thresholds = this._peerConnection.client.call.observer.config.outboundTrackDegradationThresholds;
		const reasons: string[] = [];

		if (thresholds && thresholds.fractionLost < (this.remoteFractionLost ?? 0)) reasons.push('remote-fraction-lost');
		if (thresholds && thresholds.rttInMs < (this.remoteRttInMs ?? 0)) reasons.push('remote-rtt');
		if (this.qualityLimitationReason) reasons.push(`quality-limited-${this.qualityLimitationReason}`);
		if (this.muted !== true && this.deltaPacketsSent === 0) reasons.push('no-packets-sent');

		this.degradedReasons = reasons.length === 0 ? undefined : reasons;

		this.receivingDistribution = this.createReceivingDistribution();
		this._updateAudioLevel();

		this.detectors.update();
	}

	private _updateAudioLevel(): void {
		this.rmsAudioLevel = undefined;
		this.rmsAudioLevelSource = undefined;
		this.receivedRmsAudioLevel = undefined;

		if (this.kind !== 'audio') return;

		if (0 < this.remoteInboundTracks.size) {
			const levels: number[] = [];

			for (const inboundTrack of this.remoteInboundTracks) {
				pushFinite(levels, inboundTrack.getInboundRtp()?.rmsAudioLevel);
			}
			this.receivedRmsAudioLevel = median(levels);
		}

		const sourceLevel = this._mediaSource?.rmsAudioLevel;

		if (sourceLevel !== undefined) {
			this.rmsAudioLevel = sourceLevel;
			this.rmsAudioLevelSource = 'media-source';
		} else if (this.receivedRmsAudioLevel !== undefined) {
			this.rmsAudioLevel = this.receivedRmsAudioLevel;
			this.rmsAudioLevelSource = 'receivers';
		}
	}

	private createReceivingDistribution(): PublishedTrackReceivingDistributionEntry | undefined {
		if (this.remoteInboundTracks.size === 0) return undefined;

		// One pass, filling the sample arrays the summaries need plus the fan-out counters. This used
		// to be a dozen separate `map`/`filter`/`reduce` traversals, each allocating an intermediate
		// array per metric per track per tick.

		let freezeAffected = 0;
		let freezeTotal = 0;
		let pliAffected = 0;
		let pliTotal = 0;
		let concealmentAffected = 0;
		let numberOfReceivers = 0;
		let numberOfDegradedReceivers = 0;
		let numberOfHealthyReceivers = 0;
		const bitrates: number[] = [];
		const fractionLosts: number[] = [];
		const jitters: number[] = [];
		const rtts: number[] = [];
		const jitterBufferDelays: number[] = [];
		const concealmentRatios: number[] = [];

		for (const inboundTrack of this.remoteInboundTracks) {
			const inboundRtp = inboundTrack.getInboundRtp();
			const peerConnection = inboundTrack.getPeerConnection();

			if (!inboundRtp) continue;

			if (0 < inboundRtp.deltaFreezeCount) freezeAffected += 1;
			if (0 < inboundRtp.deltaPliCount) pliAffected += 1;
			if (0 < (inboundRtp.concealmentRatio ?? 0)) concealmentAffected += 1;

			if (inboundTrack.degraded) numberOfDegradedReceivers += 1;
			else numberOfHealthyReceivers += 1;

			pliTotal += inboundRtp.deltaPliCount;
			freezeTotal += inboundRtp.deltaFreezeCount;

			++numberOfReceivers;

			pushFinite(bitrates, inboundRtp.bitrate);
			pushFinite(fractionLosts, inboundRtp.fractionLost);
			pushFinite(jitters, inboundRtp.jitter);
			pushFinite(rtts, peerConnection?.currentRttInMs);
			pushFinite(jitterBufferDelays, inboundRtp.jitterBufferDelayInMs);
			pushFinite(concealmentRatios, inboundRtp.concealmentRatio);
		}

		return {
			numberOfReceivers,
			numberOfHealthyReceivers,
			numberOfDegradedReceivers,
			degradedRatio: numberOfReceivers === 0 ? 0 : numberOfDegradedReceivers / numberOfReceivers,

			bitrate: summarize(bitrates),
			fractionLost: summarize(fractionLosts),
			jitter: summarize(jitters),
			rttInMs: summarize(rtts),
			jitterBufferDelayInMs: summarize(jitterBufferDelays),
			concealmentRatio: summarize(concealmentRatios),

			freezes: { affectedReceivers: freezeAffected, total: freezeTotal },
			plis: { affectedReceivers: pliAffected, total: pliTotal },
			concealment: { affectedReceivers: concealmentAffected },
		};
	}
}