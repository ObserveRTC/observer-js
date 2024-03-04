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
}

export type ObservedInboundTrackEvents = {
	update: [],
	close: [],
};

export type ObservedInboundTrackStats<K extends MediaKind> = K extends 'audio' ? InboundAudioTrack : InboundVideoTrack;

export type ObservedInboundTrackStatsUpdate<K extends MediaKind> = {
	[Property in keyof ObservedInboundTrackStats<K>]: ObservedInboundTrackStats<K>[Property];
}

export declare interface ObservedInboundTrack<Kind extends MediaKind> {
	on<U extends keyof ObservedInboundTrackEvents>(event: U, listener: (...args: ObservedInboundTrackEvents[U]) => void): this;
	off<U extends keyof ObservedInboundTrackEvents>(event: U, listener: (...args: ObservedInboundTrackEvents[U]) => void): this;
	once<U extends keyof ObservedInboundTrackEvents>(event: U, listener: (...args: ObservedInboundTrackEvents[U]) => void): this;
	emit<U extends keyof ObservedInboundTrackEvents>(event: U, ...args: ObservedInboundTrackEvents[U]): boolean;
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

	public get updated() {
		return this._updated;
	}

	public get stats(): ReadonlyMap<number, ObservedInboundTrackStats<Kind>> {
		return this._stats;
	}

	public set remoteOutboundTrack(track: ObservedOutboundTrack<Kind> | undefined) {
		if (this._closed) return;
		if (this._remoteOutboundTrack) return;
		track?.once('close', () => {
			this._remoteOutboundTrack = undefined;
		});
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

	public get reports() {
		return this.peerConnection.reports;
	}

	public update(sample: ObservedInboundTrackStatsUpdate<Kind>, timestamp: number) {
		if (this._closed) return;

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
		
		this._stats.set(sample.ssrc, sample);

		this._updated = timestamp;
		this.emit('update');
	}
}