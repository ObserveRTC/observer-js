import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { InboundAudioTrack, InboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { InboundAudioTrackReport, InboundVideoTrackReport } from '@observertc/report-schemas-js';
import { MediaKind } from './common/types';

export type ObservedInboundTrackModel<K extends MediaKind> = {
	trackId: string;
	kind: K;
	sfuStreamId?: string;
	sfuSinkId?: string;
}

export type ObservedInboundTrackEvents<K extends MediaKind> = {
	update: [],
	close: [],
	remoteoutboundtrack: [ObservedOutboundTrack<K>],
};

export type ObservedInboundTrackStatsUpdate<K extends MediaKind> = K extends 'audio' ? InboundAudioTrack : InboundVideoTrack;

export type ObservedInboundTrackStats<K extends MediaKind> = ObservedInboundTrackStatsUpdate<K> & {
	ssrc: number;
	bitrate: number;
	fractionLost: number;
	rttInMs?: number;
	lostPackets?: number;
	receivedPackets?: number;
	receivedFrames?: number;
	decodedFrames?: number;
	droppedFrames?: number;
	receivedSamples?: number;
	silentConcealedSamples?: number;
	fractionLoss?: number;
};

// {
// 	[Property in keyof ObservedInboundTrackStats<K>]: ObservedInboundTrackStats<K>[Property];
// }

export declare interface ObservedInboundTrack<Kind extends MediaKind> {
	on<U extends keyof ObservedInboundTrackEvents<Kind>>(event: U, listener: (...args: ObservedInboundTrackEvents<Kind>[U]) => void): this;
	off<U extends keyof ObservedInboundTrackEvents<Kind>>(event: U, listener: (...args: ObservedInboundTrackEvents<Kind>[U]) => void): this;
	once<U extends keyof ObservedInboundTrackEvents<Kind>>(event: U, listener: (...args: ObservedInboundTrackEvents<Kind>[U]) => void): this;
	emit<U extends keyof ObservedInboundTrackEvents<Kind>>(event: U, ...args: ObservedInboundTrackEvents<Kind>[U]): boolean;
	update(sample: ObservedInboundTrackStatsUpdate<Kind>, timestamp: number): void;
}

export class ObservedInboundTrack<Kind extends MediaKind> extends EventEmitter	{
	public readonly created = Date.now();

	private readonly _stats = new Map<number, ObservedInboundTrackStats<Kind>>();
	
	private _closed = false;
	private _updated = Date.now();
	private _remoteOutboundTrack?: ObservedOutboundTrack<Kind>;
	public bitrate = 0;
	public rttInMs?: number;
	public fractionLoss = 0;
	public marker?: string;

	public totalLostPackets = 0;
	public totalReceivedPackets = 0;
	public totalBytesReceived = 0;
	public totalReceivedFrames = 0;
	public totalDecodedFrames = 0;
	public totalDroppedFrames = 0;
	public totalReceivedSamples = 0;
	public totalSilentConcealedSamples = 0;
	
	public deltaLostPackets = 0;
	public deltaReceivedPackets = 0;
	public deltaBytesReceived = 0;
	public deltaReceivedFrames = 0;
	public deltaDecodedFrames = 0;
	public deltaDroppedFrames = 0;
	public deltaReceivedSamples = 0;
	public deltaSilentConcealedSamples = 0;
	
	public constructor(
		private readonly _model: ObservedInboundTrackModel<Kind>,
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

	public get kind(): Kind {
		return this._model.kind as Kind;
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

	public get stats(): ReadonlyMap<number, ObservedInboundTrackStats<Kind>> {
		return this._stats;
	}

	public get reports() {
		return this.peerConnection.reports;
	}

	public set remoteOutboundTrack(track: ObservedOutboundTrack<Kind> | undefined) {
		if (this._closed) return;
		if (this._remoteOutboundTrack) return;
		if (!track) return;
		track?.once('close', () => {
			this._remoteOutboundTrack = undefined;
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

	public resetMetrics() {
		this.bitrate = 0;
		this.rttInMs = undefined;
		this.deltaBytesReceived = 0;
		this.deltaLostPackets = 0;
		this.deltaReceivedFrames = 0;
		this.deltaDecodedFrames = 0;
		this.deltaDroppedFrames = 0;
		this.deltaReceivedSamples = 0;
		this.deltaSilentConcealedSamples = 0;
		this.fractionLoss = 0;
	}

	public update(sample: ObservedInboundTrackStatsUpdate<Kind>, timestamp: number) {
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
			timestamp,
			sampleSeq: -1,

			remoteClientId: sample.remoteClientId ?? this.remoteOutboundTrack?.peerConnection.client.clientId,
			remoteUserId: this.remoteOutboundTrack?.peerConnection.client.userId,
			remoteTrackId: this.remoteOutboundTrack?.trackId,
			remotePeerConnectionId: this.remoteOutboundTrack?.peerConnection.peerConnectionId,
			marker: this.marker,
		};

		if (this.kind === 'audio') this.reports.addInboundAudioTrackReport(report);
		else if (this.kind === 'video') this.reports.addInboundVideoTrackReport(report);
		
		if (!this._model.sfuStreamId && sample.sfuStreamId) {
			this._model.sfuStreamId = sample.sfuStreamId;
		}

		if (!this._model.sfuSinkId && sample.sfuSinkId) {
			this._model.sfuSinkId = sample.sfuSinkId;
		}

		const elapsedTimeInMs = Math.max(1, now - this._updated);
		const lastStat = this._stats.get(sample.ssrc);
		const rttInMs = sample.roundTripTime ? sample.roundTripTime * 1000 : undefined;
		const bitrate = ((sample.bytesReceived ?? 0) - (lastStat?.bytesReceived ?? 0)) * 8 / (elapsedTimeInMs / 1000);
		const lostPackets = (sample.packetsLost ?? 0) - (lastStat?.packetsLost ?? 0);
		const receivedPackets = (sample.packetsReceived ?? 0) - (lastStat?.packetsReceived ?? 0);
		const fractionLost = 0 < receivedPackets && 0 < lostPackets ? (lostPackets / (receivedPackets + lostPackets)) : 0;
		let decodedFrames: number | undefined;
		let droppedFrames: number | undefined;
		let receivedFrames: number | undefined;
		let silentConcealedSamples: number | undefined;

		if (this.kind === 'video') {
			const videoSample = sample as InboundVideoTrack;
			const lastVideoStat = lastStat as InboundVideoTrack | undefined;

			decodedFrames = (videoSample.framesDecoded ?? 0) - (lastVideoStat?.framesDecoded ?? 0);
			droppedFrames = (videoSample.framesDropped ?? 0) - (lastVideoStat?.framesDropped ?? 0);
			receivedFrames = (videoSample.framesReceived ?? 0) - (lastVideoStat?.framesReceived ?? 0);
		} else if (this.kind === 'audio') {
			const audioSample = sample as InboundAudioTrack;
			const lastAudioStat = lastStat as InboundAudioTrack | undefined;

			silentConcealedSamples = (audioSample.silentConcealedSamples ?? 0) - (lastAudioStat?.silentConcealedSamples ?? 0);
		}

		const stats: ObservedInboundTrackStats<Kind> = {
			...sample,
			fractionLost,
			rttInMs,
			bitrate,
			ssrc: sample.ssrc,
			lostPackets,
			receivedPackets,
			receivedFrames,
			decodedFrames,
			droppedFrames,
			silentConcealedSamples,
		};

		this._stats.set(sample.ssrc, stats);

		this.bitrate = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.bitrate, 0);
		this.rttInMs = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.rttInMs ?? 0), 0) / (this._stats.size || 1);
		this.totalLostPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.lostPackets ?? 0), 0);
		this.totalReceivedPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedPackets ?? 0), 0);
		this.totalBytesReceived = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.bytesReceived ?? 0), 0);
		this.totalReceivedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedFrames ?? 0), 0);
		this.totalDecodedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.decodedFrames ?? 0), 0);
		this.totalDroppedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.droppedFrames ?? 0), 0);
		this.totalReceivedSamples = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedSamples ?? 0), 0);
		this.totalSilentConcealedSamples = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.silentConcealedSamples ?? 0), 0);

		this.deltaLostPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.lostPackets ?? 0), 0);
		this.deltaReceivedPackets = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedPackets ?? 0), 0);
		this.deltaBytesReceived = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.bytesReceived ?? 0), 0);
		this.deltaReceivedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedFrames ?? 0), 0);
		this.deltaDecodedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.decodedFrames ?? 0), 0);
		this.deltaDroppedFrames = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.droppedFrames ?? 0), 0);
		this.deltaReceivedSamples = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.receivedSamples ?? 0), 0);
		this.deltaSilentConcealedSamples = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.silentConcealedSamples ?? 0), 0);
		this.fractionLoss = 0 < this.deltaReceivedPackets && 0 < this.deltaLostPackets ? (this.deltaLostPackets / (this.deltaReceivedPackets + this.deltaLostPackets)) : 0;

		this._updated = now;
		this.emit('update');
	}
}
