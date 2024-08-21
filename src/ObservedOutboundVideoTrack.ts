import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { OutboundVideoTrack } from '@observertc/sample-schemas-js';
import { OutboundAudioTrackReport, OutboundVideoTrackReport } from '@observertc/report-schemas-js';
import { ObservedInboundVideoTrack } from './ObservedInboundVideoTrack';
import { calculateBaseVideoScore, CalculatedScore } from './common/CalculatedScore';
import { ClientIssue } from './monitors/CallSummary';
import { SupportedVideoCodecType } from './common/types';

export type ObservedOutboundVideoTrackModel = {
	trackId: string;
	sfuStreamId?: string;
}

export type ObservedOutboundVideoTrackEvents = {
	qualitylimitationchanged: [string];
	update: [{
		elapsedTimeInMs: number;
	}],
	score: [CalculatedScore],
	close: [],
};

export type ObservedOutboundVideoTrackStats = OutboundVideoTrack & {
	ssrc: number;
	bitrate: number;
	rttInMs?: number;

	deltaLostPackets: number;
	deltaSentPackets: number;
	deltaSentBytes: number;
	deltaSentFrames?: number;
	deltaEncodedFrames?: number;

	statsTimestamp: number;
};

// export type ObservedOutboundTrackStatsUpdate = {
// 	[Property in keyof ObservedOutboundTrackStats<K>]: ObservedOutboundTrackStats<K>[Property];
// }

export declare interface ObservedOutboundVideoTrack {
	on<U extends keyof ObservedOutboundVideoTrackEvents>(event: U, listener: (...args: ObservedOutboundVideoTrackEvents[U]) => void): this;
	off<U extends keyof ObservedOutboundVideoTrackEvents>(event: U, listener: (...args: ObservedOutboundVideoTrackEvents[U]) => void): this;
	once<U extends keyof ObservedOutboundVideoTrackEvents>(event: U, listener: (...args: ObservedOutboundVideoTrackEvents[U]) => void): this;
	emit<U extends keyof ObservedOutboundVideoTrackEvents>(event: U, ...args: ObservedOutboundVideoTrackEvents[U]): boolean;
	update(sample: OutboundVideoTrack, timestamp: number): void;
}

export class ObservedOutboundVideoTrack extends EventEmitter	{
	public readonly created = Date.now();
	public visited = false;

	// timestamp of the MEDIA_TRACK_ADDED event
	public added?: number;
	// timestamp of the MEDIA_TRACK_REMOVED event
	public removed?: number;

	public contentType: 'lowmotion' | 'standard' | 'highmotion' = 'standard';
	public codec?: SupportedVideoCodecType;
	public highestLayer?: ObservedOutboundVideoTrackStats;

	public bitrate = 0;
	public jitter?: number;
	public rttInMs?: number;
	public marker?: string;

	public totalLostPackets = 0;
	public totalSentPackets = 0;
	public totalSentBytes = 0;
	public totalSentFrames = 0;

	public deltaLostPackets = 0;
	public deltaSentPackets = 0;
	public deltaSentBytes = 0;
	public deltaSentFrames = 0;
	public deltaEncodedFrames = 0;

	public sendingBitrate = 0;

	private readonly _stats = new Map<number, ObservedOutboundVideoTrackStats>();
	private _lastMaxStatsTimestamp = 0;
	
	private _closed = false;
	private _updated = Date.now();
	public readonly remoteInboundTracks = new Map<string, ObservedInboundVideoTrack>();

	public score?: CalculatedScore;
	public ωpendingIssuesForScores: ClientIssue[] = [];

	public constructor(
		private readonly _model: ObservedOutboundVideoTrackModel,
		public readonly peerConnection: ObservedPeerConnection,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get serviceId() {
		return this.peerConnection.serviceId;
	}

	public get roomId() {
		return this.peerConnection.roomId;
	}

	public get callId() {
		return this.peerConnection.callId;
	}

	public get clientId() {
		return this.peerConnection.clientId;
	}

	public get mediaUnitId() {
		return this.peerConnection.mediaUnitId;
	}

	public get peerConnectionId() {
		return this.peerConnection.peerConnectionId;
	}

	public get trackId() {
		return this._model.trackId;
	}

	public get sfuStreamId() {
		return this._model.sfuStreamId;
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public get updated() {
		return this._updated;
	}

	public get statsTimestamp() {
		return this._lastMaxStatsTimestamp;
	}
	
	public get stats(): ReadonlyMap<number, ObservedOutboundVideoTrackStats> {
		return this._stats;
	}

	public get closed() {
		return this._closed;
	}
	
	public close() {
		if (this._closed) return;
		this._closed = true;

		this.emit('close');
	}

	public update(sample: OutboundVideoTrack, statsTimestamp: number): void {
		if (this._closed) return;
		
		const now = Date.now();
		const report: OutboundAudioTrackReport | OutboundVideoTrackReport = {
			serviceId: this.peerConnection.client.serviceId,
			roomId: this.peerConnection.client.call.roomId,
			callId: this.peerConnection.client.call.callId,
			clientId: this.peerConnection.client.clientId,
			userId: this.peerConnection.client.userId,
			mediaUnitId: this.peerConnection.client.mediaUnitId,
			peerConnectionId: this.peerConnection.peerConnectionId,
			...sample,
			timestamp: statsTimestamp,
			sampleSeq: -1,
			marker: this.marker,
		};

		this.reports.addOutboundVideoTrackReport(report);

		const elapsedTimeInMs = Math.max(1, now - this._updated);
		const lastStat = this._stats.get(sample.ssrc);
		const rttInMs = sample.roundTripTime ? sample.roundTripTime * 1000 : undefined;
		let bitrate = 0;
		let deltaLostPackets = 0;
		let deltaSentPackets = 0;
		let deltaSentBytes = 0;

		if (sample.bytesSent && lastStat?.bytesSent && lastStat.bytesSent < sample.bytesSent) {
			bitrate = (sample.bytesSent - lastStat.bytesSent) * 8 / (elapsedTimeInMs / 1000);
		}
		if (sample.packetsLost && lastStat?.packetsLost && lastStat.packetsLost < sample.packetsLost) {
			deltaLostPackets = sample.packetsLost - lastStat.packetsLost;
		}
		if (sample.packetsSent && lastStat?.packetsSent && lastStat.packetsSent < sample.packetsSent) {
			deltaSentPackets = sample.packetsSent - lastStat.packetsSent;
		}
		if (sample.bytesSent && lastStat?.bytesSent && lastStat.bytesSent < sample.bytesSent) {
			deltaSentBytes = sample.bytesSent - lastStat.bytesSent;
		}
		
		let deltaEncodedFrames: number | undefined;
		let deltaSentFrames: number | undefined;

		const videoSample = sample as OutboundVideoTrack;
		const lastVideoStats = lastStat as OutboundVideoTrack | undefined;

		if (videoSample?.framesEncoded && lastVideoStats?.framesEncoded && lastVideoStats.framesEncoded < videoSample.framesEncoded) {
			deltaEncodedFrames = videoSample.framesEncoded - lastVideoStats.framesEncoded;
		}
		if (videoSample?.framesSent && lastVideoStats?.framesSent && lastVideoStats.framesSent < videoSample.framesSent) {
			deltaSentFrames = videoSample.framesSent - lastVideoStats.framesSent;
		}

		if (videoSample.qualityLimitationReason && lastVideoStats?.qualityLimitationReason !== videoSample.qualityLimitationReason) {
			this.emit('qualitylimitationchanged', videoSample.qualityLimitationReason);
		}

		const stats: ObservedOutboundVideoTrackStats = {
			...sample,
			rttInMs,
			bitrate,
			ssrc: sample.ssrc,

			deltaLostPackets,
			deltaSentPackets,
			deltaSentBytes,
			deltaEncodedFrames,
			deltaSentFrames,

			statsTimestamp,
		};

		this._stats.set(sample.ssrc, stats);

		this.visited = true;
		// a peer connection is active if it has at least one active track
		this.peerConnection.visited = true;

		this._updated = now;
		this.emit('update', {
			elapsedTimeInMs,
		});
	}

	private _lastUpdateMetrics?: number;

	public updateMetrics() {
		let maxStatsTimestamp = 0;
		let rttInMsSum = 0;
		let jitterSum = 0;
		let size = 0;

		this.bitrate = 0;
		this.rttInMs = undefined;

		this.sendingBitrate = 0;
		this.deltaLostPackets = 0;
		this.deltaSentPackets = 0;
		this.deltaSentBytes = 0;
		this.deltaSentFrames = 0;
		this.deltaEncodedFrames = 0;

		const highestLayer = { ssrc: 0, bitrate: -1 };

		for (const [ ssrc, stats ] of this._stats) {
			if (stats.statsTimestamp <= this._lastMaxStatsTimestamp) continue;

			this.deltaLostPackets += stats.deltaLostPackets ?? 0;
			this.deltaSentPackets += stats.deltaSentPackets ?? 0;
			this.deltaSentBytes += stats.deltaSentBytes ?? 0;
			this.deltaSentFrames += stats.deltaSentFrames ?? 0;
			this.deltaEncodedFrames += stats.deltaEncodedFrames ?? 0;
			this.bitrate += stats.bitrate;

			maxStatsTimestamp = Math.max(maxStatsTimestamp, stats.statsTimestamp);
			
			rttInMsSum += stats.rttInMs ?? 0;
			jitterSum += stats.jitter ?? 0;
			++size;

			if (stats.bitrate > highestLayer.bitrate) {
				highestLayer.ssrc = ssrc;
				highestLayer.bitrate = stats.bitrate;
			}
		}
		
		const now = Date.now();

		if (this._lastUpdateMetrics) {
			this.sendingBitrate = (this.deltaSentBytes * 8) / ((now - this._lastUpdateMetrics) / 1000);
		}
		this._lastUpdateMetrics = now;
		this.highestLayer = this._stats.get(highestLayer.ssrc);
		this.totalLostPackets += this.deltaLostPackets;
		this.totalSentPackets += this.deltaSentPackets;
		this.totalSentBytes += this.deltaSentBytes;
		this.totalSentFrames += this.deltaSentFrames;

		this.rttInMs = rttInMsSum / Math.max(size, 1);
		this.jitter = jitterSum / Math.max(size, 1);

		this._lastMaxStatsTimestamp = maxStatsTimestamp;
		this._updateQualityScore(maxStatsTimestamp);
	}

	private _updateQualityScore(timestamp: number) {
		const newIssues = this.ωpendingIssuesForScores;
		const score = calculateBaseVideoScore(this, newIssues);

		if (0 < newIssues.length) {
			this.ωpendingIssuesForScores = [];
		}

		if (!score) return (this.score = undefined);
		
		score.timestamp = timestamp;
		this.score = score;

		this.emit('score', this.score);
	}
}
