import { MediaKind } from './common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { InboundRtpStats } from './schema/ClientSample';
import { counterDelta } from './utils/stats';

export class ObservedInboundRtp implements InboundRtpStats {
	public appData?: Record<string, unknown>;

	private _visited = false;

	transportId?: string | undefined;
	codecId?: string | undefined;
	packetsReceived?: number | undefined;
	packetsLost?: number | undefined;
	mid?: string | undefined;
	remoteId?: string | undefined;
	framesDecoded?: number | undefined;
	keyFramesDecoded?: number | undefined;
	framesRendered?: number | undefined;
	framesDropped?: number | undefined;
	frameWidth?: number | undefined;
	frameHeight?: number | undefined;
	framesPerSecond?: number | undefined;
	qpSum?: number | undefined;
	totalDecodeTime?: number | undefined;
	totalInterFrameDelay?: number | undefined;
	totalSquaredInterFrameDelay?: number | undefined;
	pauseCount?: number | undefined;
	totalPausesDuration?: number | undefined;
	freezeCount?: number | undefined;
	totalFreezesDuration?: number | undefined;
	lastPacketReceivedTimestamp?: number | undefined;
	headerBytesReceived?: number | undefined;
	packetsDiscarded?: number | undefined;
	fecBytesReceived?: number | undefined;
	fecPacketsReceived?: number | undefined;
	fecPacketsDiscarded?: number | undefined;
	bytesReceived?: number | undefined;
	nackCount?: number | undefined;
	firCount?: number | undefined;
	pliCount?: number | undefined;
	totalProcessingDelay?: number | undefined;
	estimatedPlayoutTimestamp?: number | undefined;
	jitterBufferDelay?: number | undefined;
	jitterBufferTargetDelay?: number | undefined;
	jitterBufferEmittedCount?: number | undefined;
	jitterBufferMinimumDelay?: number | undefined;
	totalSamplesReceived?: number | undefined;
	concealedSamples?: number | undefined;
	silentConcealedSamples?: number | undefined;
	concealmentEvents?: number | undefined;
	insertedSamplesForDeceleration?: number | undefined;
	removedSamplesForAcceleration?: number | undefined;
	audioLevel?: number | undefined;
	totalAudioEnergy?: number | undefined;
	totalSamplesDuration?: number | undefined;
	framesReceived?: number | undefined;
	decoderImplementation?: string | undefined;
	playoutId?: string | undefined;
	powerEfficientDecoder?: boolean | undefined;
	framesAssembledFromMultiplePackets?: number | undefined;
	totalAssemblyTime?: number | undefined;
	retransmittedPacketsReceived?: number | undefined;
	retransmittedBytesReceived?: number | undefined;
	rtxSsrc?: number | undefined;
	fecSsrc?: number | undefined;
	totalCorruptionProbability?: number | undefined;
	totalSquaredCorruptionProbability?: number | undefined;
	corruptionMeasurements?: number | undefined;
	attachments?: Record<string, unknown> | undefined;
	jitter?: number | undefined;
	
	public bitrate = 0;
	public fractionLost?: number;
	public bitPerPixel = 0;

	public deltaLostPackets = 0;
	public deltaReceivedPackets = 0;
	public deltaBytesReceived = 0;
	public deltaReceivedSamples = 0;
	public deltaSilentConcealedSamples = 0;

	// Per-tick, counter-reset-safe deltas of the cumulative RTCStats counters. These are what
	// detectors need ("how many freezes/PLIs in THIS tick"), as opposed to the lifetime totals.
	public deltaConcealedSamples = 0;
	public deltaConcealmentEvents = 0;
	public deltaFreezeCount = 0;
	public deltaFreezesDuration = 0;
	public deltaPliCount = 0;
	public deltaNackCount = 0;
	public deltaFirCount = 0;
	public deltaPacketsDiscarded = 0;
	public deltaFramesDecoded = 0;
	public deltaFramesReceived = 0;
	public deltaFramesRendered = 0;
	public deltaFramesDropped = 0;
	public deltaKeyFramesDecoded = 0;
	public deltaDecodeTime = 0;
	public deltaJitterBufferDelay = 0;
	public deltaJitterBufferEmittedCount = 0;
	public deltaRetransmittedPacketsReceived = 0;
	public deltaFecPacketsReceived = 0;
	public deltaFecPacketsDiscarded = 0;
	public deltaPausesDuration = 0;

	/**
	 * Mean jitter-buffer delay for the frames/samples emitted in this tick (seconds), derived from
	 * the cumulative `jitterBufferDelay` / `jitterBufferEmittedCount` pair — the only correct way to
	 * read those two counters.
	 */
	public jitterBufferDelayInMs?: number;

	/** Fraction of the samples received in this tick that were concealed (0..1). */
	public concealmentRatio?: number;

	/** Fraction of the frames received in this tick that were dropped before rendering (0..1). */
	public framesDroppedRatio?: number;

	/**
	 * `true` when the codec or decoder implementation changed in this tick.
	 *
	 * Chrome resets `packetsReceived`/`bytesReceived` on an SSRC when the codec switches
	 * (crbug.com/webrtc/5361, open since 2015), which shows up as a sawtooth spike or a negative
	 * rate. Every delta in this tick is therefore suppressed to `0` rather than reported as traffic
	 * — otherwise a room-wide codec rollout produces a synchronized fake-degradation alert across
	 * every participant at once.
	 */
	public counterResetBoundary = false;

	// Derived from the corresponding remote-outbound-rtp (sender report), when present.
	public remoteRttInMs?: number;
	public remoteBytesSent?: number;
	public remotePacketsSent?: number;
	public remoteTimestamp?: number;

	public constructor(
		public timestamp: number,
		public id: string,
		public ssrc: number,
		public kind: MediaKind,
		public trackIdentifier: string,
		private readonly _peerConnection: ObservedPeerConnection
	) {}

	public get visited() {
		const visited = this._visited;

		this._visited = false;

		return visited;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	public getRemoteOutboundRtp() {
		return this._peerConnection.observedRemoteOutboundRtps.get(this.ssrc);
	}

	public getIceTransport() {
		return this._peerConnection.observedIceTransports.get(this.transportId ?? '');
	}

	public getCodec() {
		return this._peerConnection.observedCodecs.get(this.codecId ?? '');
	}

	public getMediaPlayout() {
		return this._peerConnection.observedMediaPlayouts.get(this.playoutId ?? '');
	}

	public getTrack() {
		return this._peerConnection.observedInboundTracks.get(this.trackIdentifier);
	}

	public update(stats: InboundRtpStats) {
		this._visited = true;
		this.deltaBytesReceived = 0;
		this.deltaLostPackets = 0;
		this.deltaReceivedPackets = 0;
		this.deltaReceivedSamples = 0;
		this.deltaSilentConcealedSamples = 0;
		this.remoteRttInMs = undefined;
		this.remoteBytesSent = undefined;
		this.remotePacketsSent = undefined;
		this.remoteTimestamp = undefined;
		this.bitrate = 0;
		this.fractionLost = undefined;
		this.bitPerPixel = 0;

		this.deltaConcealedSamples = 0;
		this.deltaConcealmentEvents = 0;
		this.deltaFreezeCount = 0;
		this.deltaFreezesDuration = 0;
		this.deltaPausesDuration = 0;
		this.deltaPliCount = 0;
		this.deltaNackCount = 0;
		this.deltaFirCount = 0;
		this.deltaPacketsDiscarded = 0;
		this.deltaFramesDecoded = 0;
		this.deltaFramesReceived = 0;
		this.deltaFramesRendered = 0;
		this.deltaFramesDropped = 0;
		this.deltaKeyFramesDecoded = 0;
		this.deltaDecodeTime = 0;
		this.deltaJitterBufferDelay = 0;
		this.deltaJitterBufferEmittedCount = 0;
		this.deltaRetransmittedPacketsReceived = 0;
		this.deltaFecPacketsReceived = 0;
		this.deltaFecPacketsDiscarded = 0;
		this.jitterBufferDelayInMs = undefined;
		this.concealmentRatio = undefined;
		this.framesDroppedRatio = undefined;

		const elapsedTimeInMs = stats.timestamp - this.timestamp;

		// crbug.com/webrtc/5361: a codec switch resets the cumulative counters on the SSRC. Treat the
		// tick as a boundary and derive nothing from it, instead of reporting a phantom spike.
		this.counterResetBoundary = (this.codecId !== undefined && stats.codecId !== undefined && this.codecId !== stats.codecId)
			|| (this.decoderImplementation !== undefined && stats.decoderImplementation !== undefined
				&& this.decoderImplementation !== stats.decoderImplementation);

		if (0 < elapsedTimeInMs && !this.counterResetBoundary) {
			const elapsedInSeconds = elapsedTimeInMs / 1000;

			// All deltas are counter-reset-safe and treat a previous value of `0` as a valid baseline
			// (a truthiness guard here silently drops the first interval of every counter).
			this.deltaBytesReceived = counterDelta(this.bytesReceived, stats.bytesReceived);
			this.deltaLostPackets = counterDelta(this.packetsLost, stats.packetsLost);
			this.deltaReceivedPackets = counterDelta(this.packetsReceived, stats.packetsReceived);
			this.deltaReceivedSamples = counterDelta(this.totalSamplesReceived, stats.totalSamplesReceived);
			this.deltaSilentConcealedSamples = counterDelta(this.silentConcealedSamples, stats.silentConcealedSamples);

			this.deltaConcealedSamples = counterDelta(this.concealedSamples, stats.concealedSamples);
			this.deltaConcealmentEvents = counterDelta(this.concealmentEvents, stats.concealmentEvents);
			this.deltaFreezeCount = counterDelta(this.freezeCount, stats.freezeCount);
			this.deltaFreezesDuration = counterDelta(this.totalFreezesDuration, stats.totalFreezesDuration);
			this.deltaPausesDuration = counterDelta(this.totalPausesDuration, stats.totalPausesDuration);
			this.deltaPliCount = counterDelta(this.pliCount, stats.pliCount);
			this.deltaNackCount = counterDelta(this.nackCount, stats.nackCount);
			this.deltaFirCount = counterDelta(this.firCount, stats.firCount);
			this.deltaPacketsDiscarded = counterDelta(this.packetsDiscarded, stats.packetsDiscarded);
			this.deltaFramesDecoded = counterDelta(this.framesDecoded, stats.framesDecoded);
			this.deltaFramesReceived = counterDelta(this.framesReceived, stats.framesReceived);
			this.deltaFramesRendered = counterDelta(this.framesRendered, stats.framesRendered);
			this.deltaFramesDropped = counterDelta(this.framesDropped, stats.framesDropped);
			this.deltaKeyFramesDecoded = counterDelta(this.keyFramesDecoded, stats.keyFramesDecoded);
			this.deltaDecodeTime = counterDelta(this.totalDecodeTime, stats.totalDecodeTime);
			this.deltaJitterBufferDelay = counterDelta(this.jitterBufferDelay, stats.jitterBufferDelay);
			this.deltaJitterBufferEmittedCount = counterDelta(this.jitterBufferEmittedCount, stats.jitterBufferEmittedCount);
			this.deltaRetransmittedPacketsReceived = counterDelta(this.retransmittedPacketsReceived, stats.retransmittedPacketsReceived);
			this.deltaFecPacketsReceived = counterDelta(this.fecPacketsReceived, stats.fecPacketsReceived);
			this.deltaFecPacketsDiscarded = counterDelta(this.fecPacketsDiscarded, stats.fecPacketsDiscarded);

			// bits per second (matches ObservedOutboundRtp.bitrate and the client-level bitrates).
			this.bitrate = (this.deltaBytesReceived * 8) / elapsedInSeconds;

			// bits per pixel of the frames decoded in this tick.
			const pixels = (stats.frameWidth ?? 0) * (stats.frameHeight ?? 0);

			if (0 < pixels && 0 < this.deltaFramesReceived) {
				this.bitPerPixel = (this.deltaBytesReceived * 8) / (this.deltaFramesReceived * pixels);
			}

			// Report 0 (not `undefined`) when there was traffic but no loss, so detectors can tell
			// "healthy" apart from "no data".
			if (0 < this.deltaReceivedPackets || 0 < this.deltaLostPackets) {
				this.fractionLost = this.deltaLostPackets / (this.deltaLostPackets + this.deltaReceivedPackets);
			}
			if (0 < this.deltaJitterBufferEmittedCount) {
				this.jitterBufferDelayInMs = (this.deltaJitterBufferDelay / this.deltaJitterBufferEmittedCount) * 1000;
			}
			if (0 < this.deltaReceivedSamples) {
				this.concealmentRatio = this.deltaConcealedSamples / this.deltaReceivedSamples;
			}
			if (0 < this.deltaFramesReceived) {
				this.framesDroppedRatio = this.deltaFramesDropped / this.deltaFramesReceived;
			}
		}

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.codecId = stats.codecId;
		this.packetsReceived = stats.packetsReceived;
		this.packetsLost = stats.packetsLost;
		this.mid = stats.mid;
		this.remoteId = stats.remoteId;
		this.framesDecoded = stats.framesDecoded;
		this.keyFramesDecoded = stats.keyFramesDecoded;
		this.framesRendered = stats.framesRendered;
		this.framesDropped = stats.framesDropped;
		this.frameWidth = stats.frameWidth;
		this.frameHeight = stats.frameHeight;
		this.framesPerSecond = stats.framesPerSecond;
		this.qpSum = stats.qpSum;
		this.totalDecodeTime = stats.totalDecodeTime;
		this.totalInterFrameDelay = stats.totalInterFrameDelay;
		this.totalSquaredInterFrameDelay = stats.totalSquaredInterFrameDelay;
		this.pauseCount = stats.pauseCount;
		this.totalPausesDuration = stats.totalPausesDuration;
		this.freezeCount = stats.freezeCount;
		this.totalFreezesDuration = stats.totalFreezesDuration;
		this.lastPacketReceivedTimestamp = stats.lastPacketReceivedTimestamp;
		this.headerBytesReceived = stats.headerBytesReceived;
		this.packetsDiscarded = stats.packetsDiscarded;
		this.fecBytesReceived = stats.fecBytesReceived;
		this.fecPacketsReceived = stats.fecPacketsReceived;
		this.fecPacketsDiscarded = stats.fecPacketsDiscarded;
		this.bytesReceived = stats.bytesReceived;
		this.nackCount = stats.nackCount;
		this.firCount = stats.firCount;
		this.pliCount = stats.pliCount;
		this.totalProcessingDelay = stats.totalProcessingDelay;
		this.estimatedPlayoutTimestamp = stats.estimatedPlayoutTimestamp;
		this.jitterBufferDelay = stats.jitterBufferDelay;
		this.jitterBufferTargetDelay = stats.jitterBufferTargetDelay;
		this.jitterBufferEmittedCount = stats.jitterBufferEmittedCount;
		this.jitterBufferMinimumDelay = stats.jitterBufferMinimumDelay;
		this.totalSamplesReceived = stats.totalSamplesReceived;
		this.concealedSamples = stats.concealedSamples;
		this.silentConcealedSamples = stats.silentConcealedSamples;
		this.concealmentEvents = stats.concealmentEvents;
		// Previously reset to `undefined` at the top of update() but never assigned, so `jitter`
		// was permanently undefined on every inbound RTP.
		this.jitter = stats.jitter;
		this.framesReceived = stats.framesReceived;
		this.retransmittedPacketsReceived = stats.retransmittedPacketsReceived;
		this.retransmittedBytesReceived = stats.retransmittedBytesReceived;
	}
}
