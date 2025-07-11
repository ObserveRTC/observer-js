import { MediaKind } from '../common/types';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { OutboundRtpStats, QualityLimitationDurations } from '../schema/ClientSample';

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

		const elapsedTimeInMs = stats.timestamp - this.timestamp;

		if (elapsedTimeInMs) {
			if (stats.packetsSent !== undefined && this.packetsSent !== undefined) {
				this.deltaPacketsSent = stats.packetsSent - this.packetsSent;
				this.packetRate = this.deltaPacketsSent / (elapsedTimeInMs / 1000);
			}
			if (stats.bytesSent !== undefined && this.bytesSent !== undefined) {
				this.deltaBytesSent = stats.bytesSent - this.bytesSent;
				this.bitrate = (this.deltaBytesSent * 8) / (elapsedTimeInMs / 1000);
			}
			if (stats.headerBytesSent !== undefined && this.headerBytesSent !== undefined) {
				this.payloadBitrate = ((this.deltaBytesSent ?? 0 - (stats.headerBytesSent - this.headerBytesSent)) * 8) / (elapsedTimeInMs / 1000);
			}
			if (this.framesSent !== undefined && stats.framesSent !== undefined) {
				this.bitPerPixel = this.deltaBytesSent ? (this.deltaBytesSent * 8) / (this.framesSent - stats.framesSent) : 0;
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