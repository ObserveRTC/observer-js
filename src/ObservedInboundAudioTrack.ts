import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { InboundAudioTrack } from '@observertc/sample-schemas-js';
import { InboundAudioTrackReport, InboundVideoTrackReport } from '@observertc/report-schemas-js';
import { calculateBaseAudioScore, CalculatedScore } from './common/CalculatedScore';
import { ClientIssue } from './monitors/CallSummary';
import { ObservedOutboundAudioTrack } from './ObservedOutboundAudioTrack';

export type ObservedInboundAudioTrackModel = {
	trackId: string;
	sfuStreamId?: string;
	sfuSinkId?: string;
}

export type ObservedInboundAudioTrackEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	score: [CalculatedScore],
	close: [],
	remoteoutboundtrack: [ObservedOutboundAudioTrack | undefined],
};

export type ObservedInboundAudioTrackStats = InboundAudioTrack & {
	ssrc: number;
	bitrate: number;
	fractionLost: number;
	rttInMs?: number;
	deltaReceivedBytes?: number;
	deltaLostPackets?: number;
	deltaReceivedPackets?: number;
	deltaReceivedFrames?: number;
	deltaDecodedFrames?: number;
	deltaDroppedFrames?: number;
	deltaReceivedSamples?: number;
	deltaSilentConcealedSamples?: number;
	fractionLoss?: number;
	statsTimestamp: number;
};

// {
// 	[Property in keyof ObservedInboundAudioTrackStats<K>]: ObservedInboundAudioTrackStats<K>[Property];
// }

export declare interface ObservedInboundAudioTrack {
	on<U extends keyof ObservedInboundAudioTrackEvents>(event: U, listener: (...args: ObservedInboundAudioTrackEvents[U]) => void): this;
	off<U extends keyof ObservedInboundAudioTrackEvents>(event: U, listener: (...args: ObservedInboundAudioTrackEvents[U]) => void): this;
	once<U extends keyof ObservedInboundAudioTrackEvents>(event: U, listener: (...args: ObservedInboundAudioTrackEvents[U]) => void): this;
	emit<U extends keyof ObservedInboundAudioTrackEvents>(event: U, ...args: ObservedInboundAudioTrackEvents[U]): boolean;
	update(sample: InboundAudioTrack, timestamp: number): void;
}

export class ObservedInboundAudioTrack extends EventEmitter	{
	public readonly created = Date.now();
	public visited = false;

	private readonly _stats = new Map<number, ObservedInboundAudioTrackStats>();
	
	private _closed = false;
	private _updated = Date.now();
	private _remoteOutboundTrack?: ObservedOutboundAudioTrack;
	private _lastMaxStatsTimestamp = 0;

	public bitrate = 0;
	public rttInMs?: number;
	public jitter?: number;
	public fractionLoss = 0;
	public marker?: string;

	public totalLostPackets = 0;
	public totalReceivedPackets = 0;
	public totalBytesReceived = 0;
	public totalReceivedSamples = 0;
	public totalSilentConcealedSamples = 0;
	
	public deltaLostPackets = 0;
	public deltaReceivedPackets = 0;
	public deltaBytesReceived = 0;
	public deltaReceivedSamples = 0;
	public deltaSilentConcealedSamples = 0;
	
	public score?: CalculatedScore;
	public ωpendingIssuesForScores: ClientIssue[] = [];

	public constructor(
		private readonly _model: ObservedInboundAudioTrackModel,
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

	public get sfuSinkId() {
		return this._model.sfuSinkId;
	}

	public get updated() {
		return this._updated;
	}

	public get statsTimestamp() {
		return this._lastMaxStatsTimestamp;
	}

	public get stats(): ReadonlyMap<number, ObservedInboundAudioTrackStats> {
		return this._stats;
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public set remoteOutboundTrack(track: ObservedOutboundAudioTrack | undefined) {
		if (this._closed) return;
		if (this._remoteOutboundTrack) return;
		if (!track) return;

		track.once('close', () => {
			this._remoteOutboundTrack = undefined;
			this.emit('remoteoutboundtrack', undefined);
		});
		this._remoteOutboundTrack = track;
		this.emit('remoteoutboundtrack', track);
	}

	public get remoteOutboundTrack() {
		return this._remoteOutboundTrack;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;

		this._closed = true;

		this.emit('close');
	}

	public update(sample: InboundAudioTrack, statsTimestamp: number) {
		if (this._closed) return;
		
		const now = Date.now();
		const report: InboundAudioTrackReport | InboundVideoTrackReport = {
			serviceId: this.peerConnection.client.call.serviceId,
			roomId: this.peerConnection.client.call.roomId,
			callId: this.peerConnection.client.call.callId,
			clientId: this.peerConnection.client.clientId,
			userId: this.peerConnection.client.userId,
			mediaUnitId: this.peerConnection.client.mediaUnitId,
			peerConnectionId: this.peerConnection.peerConnectionId,
			...sample,
			timestamp: statsTimestamp,
			sampleSeq: -1,

			remoteClientId: sample.remoteClientId ?? this.remoteOutboundTrack?.peerConnection.client.clientId,
			remoteUserId: this.remoteOutboundTrack?.peerConnection.client.userId,
			remoteTrackId: this.remoteOutboundTrack?.trackId,
			remotePeerConnectionId: this.remoteOutboundTrack?.peerConnection.peerConnectionId,
			marker: this.marker,
		};

		this.reports.addInboundAudioTrackReport(report);
		
		if (!this._model.sfuStreamId && sample.sfuStreamId) {
			this._model.sfuStreamId = sample.sfuStreamId;
		}

		if (!this._model.sfuSinkId && sample.sfuSinkId) {
			this._model.sfuSinkId = sample.sfuSinkId;
		}

		const elapsedTimeInMs = Math.max(1, now - this._updated);
		const lastStat = this._stats.get(sample.ssrc);
		const rttInMs = sample.roundTripTime ? sample.roundTripTime * 1000 : undefined;
		let bitrate = 0;
		let deltaReceivedBytes = 0;
		let fractionLost = 0;
		let deltaLostPackets = 0;
		let deltaReceivedPackets = 0;
		
		if (lastStat?.bytesReceived && sample.bytesReceived && lastStat.bytesReceived < sample.bytesReceived) {
			deltaReceivedBytes = sample.bytesReceived - lastStat.bytesReceived;
			bitrate = deltaReceivedBytes / (elapsedTimeInMs / 1000);
		}
		if (lastStat?.packetsReceived && sample?.packetsReceived && lastStat.packetsReceived < sample.packetsReceived) {
			deltaReceivedPackets = sample.packetsReceived - lastStat.packetsReceived;
		}
		if (lastStat?.packetsLost && sample.packetsLost && lastStat.packetsLost < sample.packetsLost) {
			deltaLostPackets = sample.packetsLost - lastStat.packetsLost;
			if (0 < deltaReceivedPackets) {
				fractionLost = deltaLostPackets / (deltaReceivedPackets + deltaLostPackets);
			}
		}
		
		let deltaDecodedFrames: number | undefined;
		let deltaDroppedFrames: number | undefined;
		let deltaReceivedFrames: number | undefined;
		let deltaSilentConcealedSamples: number | undefined;
		const audioSample = sample as InboundAudioTrack;
		const lastAudioStat = lastStat as InboundAudioTrack | undefined;
			
		if (audioSample.silentConcealedSamples && lastAudioStat?.silentConcealedSamples && lastAudioStat.silentConcealedSamples < audioSample.silentConcealedSamples) {
			deltaSilentConcealedSamples = audioSample.silentConcealedSamples - lastAudioStat.silentConcealedSamples;
		}

		const stats: ObservedInboundAudioTrackStats = {
			...sample,
			fractionLost,
			rttInMs,
			bitrate,
			ssrc: sample.ssrc,
			deltaReceivedBytes,
			deltaLostPackets,
			deltaReceivedPackets,
			deltaReceivedFrames,
			deltaDecodedFrames,
			deltaDroppedFrames,
			deltaSilentConcealedSamples,
			statsTimestamp,
		};

		this._stats.set(sample.ssrc, stats);

		this.visited = true;
		this._updated = now;
		
		this.emit('update', {
			elapsedTimeInMs,
		});
	}

	public updateMetrics() {
		let maxStatsTimestamp = 0;
		let rttInMsSum = 0;
		let jitterSum = 0;
		let size = 0;

		this.bitrate = 0;
		this.rttInMs = undefined;
		this.deltaBytesReceived = 0;
		this.deltaLostPackets = 0;
		this.deltaReceivedSamples = 0;
		this.deltaSilentConcealedSamples = 0;
		this.fractionLoss = 0;

		for (const [ , stats ] of this._stats) {
			if (stats.statsTimestamp <= this._lastMaxStatsTimestamp) continue;

			this.deltaBytesReceived += stats.deltaReceivedBytes ?? 0;
			this.deltaLostPackets += stats.deltaLostPackets ?? 0;
			this.deltaReceivedPackets += stats.deltaReceivedFrames ?? 0;
			this.deltaReceivedSamples += stats.deltaReceivedSamples ?? 0;
			this.deltaSilentConcealedSamples += stats.deltaSilentConcealedSamples ?? 0;
			this.bitrate += stats.bitrate;

			maxStatsTimestamp = Math.max(maxStatsTimestamp, stats.statsTimestamp);
			
			rttInMsSum += stats.rttInMs ?? 0;
			jitterSum += stats.jitter ?? 0;
			++size;
		}

		this.totalBytesReceived += this.deltaBytesReceived;
		this.totalLostPackets += this.deltaLostPackets;
		this.totalReceivedPackets += this.deltaReceivedPackets;
		this.totalReceivedSamples += this.deltaReceivedSamples;
		this.totalSilentConcealedSamples += this.deltaSilentConcealedSamples;

		this.rttInMs = rttInMsSum / Math.max(size, 1);
		this.jitter = jitterSum / Math.max(size, 1);
		this.fractionLoss = 0 < this.deltaReceivedPackets && 0 < this.deltaLostPackets ? (this.deltaLostPackets / (this.deltaReceivedPackets + this.deltaLostPackets)) : 0;

		this._lastMaxStatsTimestamp = maxStatsTimestamp;

		this._updateQualityScore(maxStatsTimestamp);
	}

	private _updateQualityScore(timestamp: number) {
		const newIssues = this.ωpendingIssuesForScores;
		const score = calculateBaseAudioScore(this, newIssues);

		if (0 < newIssues.length) {
			this.ωpendingIssuesForScores = [];
		}

		if (!score) return (this.score = undefined);

		if (0.05 < this.fractionLoss) {
			score.score *= 0.5;
			score.remarks.push({
				severity: 'major',
				text: 'Fraction loss is too high',
			});
		}

		score.timestamp = timestamp;
		this.score = score;

		this.emit('score', this.score);
	}
}
