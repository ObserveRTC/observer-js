import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { OutboundAudioTrack, OutboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { OutboundAudioTrackReport, OutboundVideoTrackReport } from '@observertc/report-schemas-js';
import { MediaKind } from './common/types';

export type ObservedOutboundTrackModel<K extends MediaKind> = {
	trackId: string;
	kind: K;
	sfuStreamId?: string;
}

export type ObservedOutboundTrackEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	close: [],
};

export type ObservedOutboundTrackStatsUpdate<K extends MediaKind> = K extends 'audio' ? OutboundAudioTrack : OutboundVideoTrack;

export type ObservedOutboundTrackStats<K extends MediaKind> = ObservedOutboundTrackStatsUpdate<K> & {
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

// export type ObservedOutboundTrackStatsUpdate<K extends MediaKind> = {
// 	[Property in keyof ObservedOutboundTrackStats<K>]: ObservedOutboundTrackStats<K>[Property];
// }

export declare interface ObservedOutboundTrack<Kind extends MediaKind> {
	on<U extends keyof ObservedOutboundTrackEvents>(event: U, listener: (...args: ObservedOutboundTrackEvents[U]) => void): this;
	off<U extends keyof ObservedOutboundTrackEvents>(event: U, listener: (...args: ObservedOutboundTrackEvents[U]) => void): this;
	once<U extends keyof ObservedOutboundTrackEvents>(event: U, listener: (...args: ObservedOutboundTrackEvents[U]) => void): this;
	emit<U extends keyof ObservedOutboundTrackEvents>(event: U, ...args: ObservedOutboundTrackEvents[U]): boolean;
	update(sample: ObservedOutboundTrackStatsUpdate<Kind>, timestamp: number): void;
}

export class ObservedOutboundTrack<Kind extends MediaKind> extends EventEmitter	{
	public readonly created = Date.now();

	public bitrate = 0;
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

	private readonly _stats = new Map<number, ObservedOutboundTrackStats<Kind>>();
	private _lastMaxStatsTimestamp = 0;
	
	private _closed = false;
	private _updated = Date.now();
	private _remoteInboundTracks = new Map<string, ObservedInboundTrack<Kind>>();

	public constructor(
		private readonly _model: ObservedOutboundTrackModel<Kind>,
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

	public get kind(): Kind {
		return this._model.kind as Kind;
	}
	
	public get trackId() {
		return this._model.trackId;
	}

	public get sfuStreamId() {
		return this._model.sfuStreamId;
	}

	public get remoteInboundTracks(): ReadonlyMap<string, ObservedInboundTrack<Kind>> {
		return this._remoteInboundTracks;
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public get updated() {
		return this._updated;
	}
	
	public get stats(): ReadonlyMap<number, ObservedOutboundTrackStats<Kind>> {
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

	public update(sample: ObservedOutboundTrackStatsUpdate<Kind>, statsTimestamp: number): void {
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

		if (this.kind === 'audio') this.reports.addOutboundAudioTrackReport(report);
		else if (this.kind === 'video') this.reports.addOutboundVideoTrackReport(report);

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

		if (this.kind === 'video') {
			const videoSample = sample as OutboundVideoTrack;
			const lastVideoStats = lastStat as OutboundVideoTrack | undefined;

			if (videoSample?.framesEncoded && lastVideoStats?.framesEncoded && lastVideoStats.framesEncoded < videoSample.framesEncoded) {
				deltaEncodedFrames = videoSample.framesEncoded - lastVideoStats.framesEncoded;
			}
			if (videoSample?.framesSent && lastVideoStats?.framesSent && lastVideoStats.framesSent < videoSample.framesSent) {
				deltaSentFrames = videoSample.framesSent - lastVideoStats.framesSent;
			}
		}
		const stats: ObservedOutboundTrackStats<Kind> = {
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

		// this.bitrate = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.bitrate, 0);
		// this.rttInMs = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.rttInMs ?? 0), 0) / (this._stats.size || 1);

		// this.totalLostPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.packetsLost ?? 0), 0);
		// this.totalSentPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.packetsSent ?? 0), 0);
		// this.totalSentBytes = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.bytesSent ?? 0), 0);
		// this.totalSentFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.deltaSentPackets ?? 0), 0);

		// this.deltaEncodedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.deltaEncodedFrames ?? 0), 0);
		// this.deltaSentFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.deltaSentFrames ?? 0), 0);
		// this.deltaLostPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.deltaLostPackets, 0);
		// this.deltaSentPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.deltaSentPackets, 0);
		// this.deltaSentBytes = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.deltaSentBytes, 0);

		// setting up sfu connection as it is not always available at the first sample
		if (sample.sfuStreamId && !this._model.sfuStreamId) {
			this._model.sfuStreamId = sample.sfuStreamId;
		
			this.once('close', () => {
				if (!this._model.sfuStreamId) return;
				if (this.kind === 'audio') this.peerConnection.client.call.sfuStreamIdToOutboundAudioTrack.delete(this._model.sfuStreamId);
				else if (this.kind === 'video') this.peerConnection.client.call.sfuStreamIdToOutboundVideoTrack.delete(this._model.sfuStreamId);
			});

			if (this.kind === 'audio') this.peerConnection.client.call.sfuStreamIdToOutboundAudioTrack.set(this._model.sfuStreamId, this as ObservedOutboundTrack<'audio'>);
			else if (this.kind === 'video') this.peerConnection.client.call.sfuStreamIdToOutboundVideoTrack.set(this._model.sfuStreamId, this as ObservedOutboundTrack<'video'>);
		}

		this._updated = now;
		this.emit('update', {
			elapsedTimeInMs,
		});
	}

	public connectInboundTrack(track: ObservedInboundTrack<Kind>) {
		if (this._closed) return;

		track.remoteOutboundTrack = this;
		track.once('close', () => {
			this._remoteInboundTracks.delete(track.trackId);
		});

		this._remoteInboundTracks.set(track.trackId, track);
	}

	public updateMetrics() {
		let maxStatsTimestamp = 0;
		let rttInMsSum = 0;
		let size = 0;

		this.bitrate = 0;
		this.rttInMs = undefined;

		this.deltaLostPackets = 0;
		this.deltaSentPackets = 0;
		this.deltaSentBytes = 0;
		this.deltaSentFrames = 0;
		this.deltaEncodedFrames = 0;

		for (const [ , stats ] of this._stats) {
			if (stats.statsTimestamp <= this._lastMaxStatsTimestamp) continue;

			this.deltaLostPackets += stats.deltaLostPackets ?? 0;
			this.deltaSentPackets += stats.deltaSentPackets ?? 0;
			this.deltaSentBytes += stats.deltaSentBytes ?? 0;
			this.deltaSentFrames += stats.deltaSentFrames ?? 0;
			this.deltaEncodedFrames += stats.deltaEncodedFrames ?? 0;
			this.bitrate += stats.bitrate;

			maxStatsTimestamp = Math.max(maxStatsTimestamp, stats.statsTimestamp);
			
			rttInMsSum += stats.rttInMs ?? 0;
			++size;
		}

		this.totalLostPackets += this.deltaLostPackets;
		this.totalSentPackets += this.deltaSentPackets;
		this.totalSentBytes += this.deltaSentBytes;
		this.totalSentFrames += this.deltaSentFrames;

		this.rttInMs = rttInMsSum / Math.max(size, 1);

		this._lastMaxStatsTimestamp = maxStatsTimestamp;
	}
}
