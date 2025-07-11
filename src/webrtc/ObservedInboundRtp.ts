import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { InboundRtpStats } from '../schema/ClientSample';

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
		this.bitrate = 0;
		this.jitter = undefined;
		this.fractionLost = undefined;
		this.bitPerPixel = 0;

		const elapsedTimeInMs = stats.timestamp - this.timestamp;

		if (elapsedTimeInMs) {
			// update metrics here
			if (this.bytesReceived && stats.bytesReceived && this.bytesReceived < stats.bytesReceived) {
				this.bitrate = ((stats.bytesReceived - (this.bytesReceived ?? 0)) * 8) / elapsedTimeInMs;
			}
			if (this.packetsLost && stats.packetsLost && this.packetsLost < stats.packetsLost) {
				this.deltaLostPackets = stats.packetsLost - this.packetsLost;
			}
			if (this.packetsReceived && stats.packetsReceived && this.packetsReceived < stats.packetsReceived) {
				this.deltaReceivedPackets = stats.packetsReceived - this.packetsReceived;
			}
			if (this.totalSamplesReceived && stats.totalSamplesReceived && this.totalSamplesReceived < stats.totalSamplesReceived) {
				this.deltaReceivedSamples = stats.totalSamplesReceived - this.totalSamplesReceived;
			}
			if (this.silentConcealedSamples && stats.silentConcealedSamples && this.silentConcealedSamples < stats.silentConcealedSamples) {
				this.deltaSilentConcealedSamples = stats.silentConcealedSamples - this.silentConcealedSamples;
			}
			if (stats.bytesReceived && this.framesReceived && stats.framesReceived && this.framesReceived < stats.framesReceived) {
				this.bitPerPixel = (stats.bytesReceived - (this.bytesReceived ?? 0)) / (stats.framesReceived - this.framesReceived);
			}
			if (this.deltaLostPackets && this.deltaReceivedPackets) {
				this.fractionLost = this.deltaLostPackets / (this.deltaLostPackets + this.deltaReceivedPackets);
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
	}
}
