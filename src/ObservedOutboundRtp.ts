import { MediaKind } from './common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { OutboundRtpStats, QualityLimitationDurations } from './schema/ClientSample';
import { counterDelta } from './utils/stats';

export class ObservedOutboundRtp implements OutboundRtpStats {
	private _visited = false;
	public appData?: Record<string, unknown>;

	transportId?: string | undefined;
	codecId?: string | undefined;
	packetsSent?: number | undefined;
	bytesSent?: number | undefined;
	mid?: string | undefined;
	mediaSourceId?: string | undefined;
	remoteId?: string | undefined;
	rid?: string | undefined;
	headerBytesSent?: number | undefined;
	retransmittedPacketsSent?: number | undefined;
	retransmittedBytesSent?: number | undefined;
	rtxSsrc?: number | undefined;
	targetBitrate?: number | undefined;
	totalEncodedBytesTarget?: number | undefined;
	frameWidth?: number | undefined;
	frameHeight?: number | undefined;
	framesPerSecond?: number | undefined;
	framesSent?: number | undefined;
	hugeFramesSent?: number | undefined;
	framesEncoded?: number | undefined;
	keyFramesEncoded?: number | undefined;
	qpSum?: number | undefined;
	totalEncodeTime?: number | undefined;
	totalPacketSendDelay?: number | undefined;
	qualityLimitationReason?: string | undefined;
	qualityLimitationResolutionChanges?: number | undefined;
	nackCount?: number | undefined;
	firCount?: number | undefined;
	pliCount?: number | undefined;
	encoderImplementation?: string | undefined;
	powerEfficientEncoder?: boolean | undefined;
	active?: boolean | undefined;
	scalabilityMode?: string | undefined;
	qualityLimitationDurations?: QualityLimitationDurations | undefined;
	attachments?: Record<string, unknown> | undefined;

	// derived fields
	public bitrate = 0;
	public payloadBitrate = 0;
	public packetRate = 0;
	public bitPerPixel = 0;
	
	public deltaPacketsSent = 0;
	public deltaBytesSent = 0;

	// Per-tick, counter-reset-safe deltas of the cumulative RTCStats counters.
	public deltaFramesSent = 0;
	public deltaFramesEncoded = 0;
	public deltaKeyFramesEncoded = 0;
	public deltaNackCount = 0;
	public deltaPliCount = 0;
	public deltaFirCount = 0;
	public deltaRetransmittedPacketsSent = 0;
	public deltaRetransmittedBytesSent = 0;
	public deltaEncodeTime = 0;
	public deltaQualityLimitationResolutionChanges = 0;

	// Derived from the corresponding remote-inbound-rtp (receiver report), when present.
	public remoteRttInMs?: number;
	public remoteFractionLost?: number;
	public remoteJitter?: number;
	public remotePacketsLost?: number;

	public constructor(
		public timestamp: number,
		public id: string,
		public ssrc: number,
		public kind: MediaKind,
		private readonly _peerConnection: ObservedPeerConnection,
	) {
	}

	public get visited() {
		const visited = this._visited;
	
		this._visited = false;
	
		return visited;
	}

	public getPeerConnection() {
		return this._peerConnection;
	}

	public getRemoteInboundRtp() {
		return this._peerConnection.observedRemoteInboundRtps.get(this.ssrc);
	}

	public getCodec() {
		return this._peerConnection.observedCodecs.get(this.codecId ?? '');
	}

	public getMediaSource() {
		return this._peerConnection.observedMediaSources.get(this.mediaSourceId ?? '');
	}

	public getTrack() {
		return this.getMediaSource()?.getTrack();
	}

	public update(stats: OutboundRtpStats) {
		this._visited = true;
		this.bitPerPixel = 0;
		this.bitrate = 0;
		this.payloadBitrate = 0;
		this.packetRate = 0;
		this.deltaPacketsSent = 0;
		this.deltaBytesSent = 0;
		this.deltaFramesSent = 0;
		this.deltaFramesEncoded = 0;
		this.deltaKeyFramesEncoded = 0;
		this.deltaNackCount = 0;
		this.deltaPliCount = 0;
		this.deltaFirCount = 0;
		this.deltaRetransmittedPacketsSent = 0;
		this.deltaRetransmittedBytesSent = 0;
		this.deltaEncodeTime = 0;
		this.deltaQualityLimitationResolutionChanges = 0;
		this.remoteRttInMs = undefined;
		this.remoteFractionLost = undefined;
		this.remoteJitter = undefined;
		this.remotePacketsLost = undefined;

		const elapsedTimeInMs = stats.timestamp - this.timestamp;

		if (elapsedTimeInMs) {
			// Guard against counter resets / SSRC reuse: only accept a non-negative delta.
			if (stats.packetsSent !== undefined && this.packetsSent !== undefined && stats.packetsSent >= this.packetsSent) {
				this.deltaPacketsSent = stats.packetsSent - this.packetsSent;
				this.packetRate = this.deltaPacketsSent / (elapsedTimeInMs / 1000);
			}
			if (stats.bytesSent !== undefined && this.bytesSent !== undefined && stats.bytesSent >= this.bytesSent) {
				this.deltaBytesSent = stats.bytesSent - this.bytesSent;
				this.bitrate = (this.deltaBytesSent * 8) / (elapsedTimeInMs / 1000);
			}
			// NOTE `??` binds looser than `-`, so the previous expression parsed as
			// `deltaBytesSent ?? (0 - headerDelta)` and always yielded `deltaBytesSent` — i.e.
			// payloadBitrate silently equalled bitrate and never subtracted the header bytes.
			const deltaHeaderBytesSent = counterDelta(this.headerBytesSent, stats.headerBytesSent);

			this.payloadBitrate = (Math.max(0, this.deltaBytesSent - deltaHeaderBytesSent) * 8) / (elapsedTimeInMs / 1000);

			this.deltaFramesSent = counterDelta(this.framesSent, stats.framesSent);
			this.deltaFramesEncoded = counterDelta(this.framesEncoded, stats.framesEncoded);
			this.deltaKeyFramesEncoded = counterDelta(this.keyFramesEncoded, stats.keyFramesEncoded);
			this.deltaNackCount = counterDelta(this.nackCount, stats.nackCount);
			this.deltaPliCount = counterDelta(this.pliCount, stats.pliCount);
			this.deltaFirCount = counterDelta(this.firCount, stats.firCount);
			this.deltaRetransmittedPacketsSent = counterDelta(this.retransmittedPacketsSent, stats.retransmittedPacketsSent);
			this.deltaRetransmittedBytesSent = counterDelta(this.retransmittedBytesSent, stats.retransmittedBytesSent);
			this.deltaEncodeTime = counterDelta(this.totalEncodeTime, stats.totalEncodeTime);
			this.deltaQualityLimitationResolutionChanges = counterDelta(
				this.qualityLimitationResolutionChanges, stats.qualityLimitationResolutionChanges,
			);

			// bits per pixel of the frames sent in this tick. (The previous expression subtracted in
			// reverse — `previous - current` — so it was always negative, and divided by frames, not pixels.)
			const pixels = (stats.frameWidth ?? 0) * (stats.frameHeight ?? 0);

			if (0 < pixels && 0 < this.deltaFramesSent) {
				this.bitPerPixel = (this.deltaBytesSent * 8) / (this.deltaFramesSent * pixels);
			}
		}

		this.timestamp = stats.timestamp;
		this.transportId = stats.transportId;
		this.codecId = stats.codecId;
		this.packetsSent = stats.packetsSent;
		this.bytesSent = stats.bytesSent;
		this.mid = stats.mid;
		this.mediaSourceId = stats.mediaSourceId;
		this.remoteId = stats.remoteId;
		this.rid = stats.rid;
		this.headerBytesSent = stats.headerBytesSent;
		this.retransmittedPacketsSent = stats.retransmittedPacketsSent;
		this.retransmittedBytesSent = stats.retransmittedBytesSent;
		this.rtxSsrc = stats.rtxSsrc;
		this.targetBitrate = stats.targetBitrate;
		this.totalEncodedBytesTarget = stats.totalEncodedBytesTarget;
		this.frameWidth = stats.frameWidth;
		this.frameHeight = stats.frameHeight;
		this.framesPerSecond = stats.framesPerSecond;
		this.framesSent = stats.framesSent;
		this.hugeFramesSent = stats.hugeFramesSent;
		this.framesEncoded = stats.framesEncoded;
		this.keyFramesEncoded = stats.keyFramesEncoded;
		this.qpSum = stats.qpSum;
		this.totalEncodeTime = stats.totalEncodeTime;
		this.totalPacketSendDelay = stats.totalPacketSendDelay;
		this.qualityLimitationReason = stats.qualityLimitationReason;
		this.qualityLimitationResolutionChanges = stats.qualityLimitationResolutionChanges;
		this.nackCount = stats.nackCount;
		this.firCount = stats.firCount;
		this.pliCount = stats.pliCount;
		this.encoderImplementation = stats.encoderImplementation;
		this.powerEfficientEncoder = stats.powerEfficientEncoder;
		this.active = stats.active;
		this.scalabilityMode = stats.scalabilityMode;
		this.qualityLimitationDurations = stats.qualityLimitationDurations;
		this.attachments = stats.attachments;
	}
}