import { EventEmitter } from 'events';
import { StorageProvider } from './storages/StorageProvider';
import * as Models from './models/Models';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { InboundAudioTrack, InboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { InboundAudioTrackReport, InboundVideoTrackReport } from '@observertc/report-schemas-js';
import { MediaKind } from './common/types';
import { createSingleExecutor } from './common/SingleExecutor';

export type ObservedInboundTrackConfig<K extends MediaKind> = {
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
	public static async create<K extends MediaKind>(
		config: ObservedInboundTrackConfig<K>,
		peerConnection: ObservedPeerConnection,
		storageProvider: StorageProvider,
	) {
		const model = new Models.InboundTrack({
			serviceId: peerConnection.client.serviceId,
			roomId: peerConnection.client.roomId,
			callId: peerConnection.client.callId,
			clientId: peerConnection.client.clientId,
			mediaUnitId: peerConnection.client.mediaUnitId,
			peerConnectionId: peerConnection.peerConnectionId,
			trackId: config.trackId,
			kind: config.kind,
			sfuStreamId: config.sfuStreamId,
			sfuSinkId: config.sfuSinkId,
		});

		const alreadyInserted = await storageProvider.inboundTrackStorage.insert(config.trackId, model);

		if (alreadyInserted) throw new Error(`InboundAudioTrack with id ${config.trackId} already exists`);

		return new ObservedInboundTrack<K>(model, peerConnection, storageProvider);
	}

	private readonly _stats = new Map<number, ObservedInboundTrackStats<Kind>>();
	private readonly _execute = createSingleExecutor();
	
	private _closed = false;
	private _updated = Date.now();
	private _remoteOutboundTrack?: ObservedOutboundTrack<Kind>;
	public bitrate = -1;
	public rttInMs = -1;
	
	private constructor(
		private readonly _model: Models.InboundTrack,
		public readonly peerConnection: ObservedPeerConnection,
		private readonly _storageProvider: StorageProvider,
	) {
		super();
	}

	public get serviceId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get roomId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.roomId!;
	}

	public get callId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.callId!;
	}

	public get clientId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.clientId!;
	}

	public get mediaUnitId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.mediaUnitId!;
	}

	public get peerConnectionId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.peerConnectionId!;
	}

	public get trackId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.trackId!;
	}

	public get kind(): Kind {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.kind! as Kind;
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

		this._execute(() => this._storageProvider.inboundTrackStorage.remove(this.trackId))
			.catch(() => void 0)
			.finally(() => this.emit('close'));
	}

	public async update(sample: ObservedInboundTrackStatsUpdate<Kind>, timestamp: number) {
		if (this._closed) return;
		let executeSave = false;

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
		};

		if (this.kind === 'audio') this.reports.addInboundAudioTrackReport(report);
		else if (this.kind === 'video') this.reports.addInboundVideoTrackReport(report);
		
		if (!this._model.sfuStreamId && sample.sfuStreamId) {
			this._model.sfuStreamId = sample.sfuStreamId;
			executeSave = true;
		}

		if (!this._model.sfuSinkId && sample.sfuSinkId) {
			this._model.sfuSinkId = sample.sfuSinkId;
			executeSave = true;
		}

		const elapsedTimeInMs = Math.max(1, timestamp - this._updated);
		const lastStat = this._stats.get(sample.ssrc);
		const rttInMs = sample.roundTripTime ? sample.roundTripTime * 1000 : undefined;
		const bitrate = ((sample.bytesReceived ?? 0) - (lastStat?.bytesReceived ?? 0)) * 8 / (elapsedTimeInMs / 1000);
		const lostPackets = (sample.packetsLost ?? 0) - (lastStat?.packetsLost ?? 0);
		const receivedPackets = (sample.packetsReceived ?? 0) - (lastStat?.packetsReceived ?? 0);
		const fractionLost = 0 < receivedPackets && 0 < lostPackets ? (lostPackets / (receivedPackets + lostPackets)) : 0;
		const stats: ObservedInboundTrackStats<Kind> = {
			...sample,
			fractionLost,
			rttInMs,
			bitrate,
			ssrc: sample.ssrc,
		};

		this._stats.set(sample.ssrc, stats);

		this.bitrate = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.bitrate, 0);
		this.rttInMs = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.rttInMs ?? 0), 0) / (this._stats.size || 1);
		
		if (executeSave) await this._save();

		this._updated = timestamp;
		this.emit('update');
	}

	private async _save() {
		if (this._closed) throw new Error(`OutboundTrack ${this.trackId} is closed`);
		
		return this._storageProvider.inboundTrackStorage.set(this.trackId, this._model);
	}
}
