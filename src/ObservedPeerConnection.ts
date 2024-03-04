import { EventEmitter } from 'events';
import * as Models from './models/Models';
import { StorageProvider } from './storages/StorageProvider';
import { PeerConnectionTransport } from '@observertc/sample-schemas-js';
import { ObservedClient } from './ObservedClient';
import { ObservedInboundTrack, ObservedInboundTrackConfig } from './ObservedInboundTrack';
import { ObservedOutboundTrack, ObservedOutboundTrackConfig } from './ObservedOutboundTrack';
import { PeerConnectionTransportReport } from '@observertc/report-schemas-js';
import { createSingleExecutor } from './common/SingleExecutor';

export type ObservedPeerConnectionEvents = {
	update: [],
	close: [],
	newinboudaudiotrack: [ObservedInboundTrack<'audio'>],
	newinboudvideotrack: [ObservedInboundTrack<'video'>],
	newoutboundaudiotrack: [ObservedOutboundTrack<'audio'>],
	newoutboundvideotrack: [ObservedOutboundTrack<'video'>],
};

export type ObservedPeerConnectionConfig = {
	peerConnectionId: string;
};

export type ObservedPeerConnectionStats = Omit<PeerConnectionTransport, 'transportId' | 'label'>;

export declare interface ObservedPeerConnection {
	on<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	off<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	once<U extends keyof ObservedPeerConnectionEvents>(event: U, listener: (...args: ObservedPeerConnectionEvents[U]) => void): this;
	emit<U extends keyof ObservedPeerConnectionEvents>(event: U, ...args: ObservedPeerConnectionEvents[U]): boolean;
}

export class ObservedPeerConnection extends EventEmitter {
	public static async create(
		config: ObservedPeerConnectionConfig,
		client: ObservedClient,
		storageProvider: StorageProvider,
	): Promise<ObservedPeerConnection> {
		const model = new Models.PeerConnection({
			roomId: client.roomId,
			serviceId: client.serviceId,
			callId: client.callId,
			clientId: client.clientId,
			peerConnectionId: config.peerConnectionId,
		});

		const alreadyInserted = await storageProvider.peerConnectionStorage.insert(config.peerConnectionId, model);

		if (alreadyInserted) throw new Error(`PeerConnection with id ${config.peerConnectionId} already exists`);

		return new ObservedPeerConnection(model, client, storageProvider);
	}

	private _closed = false;
	private _updated = Date.now();
	private _sample?: ObservedPeerConnectionStats;

	private readonly _inboundAudioTracks = new Map<string, ObservedInboundTrack<'audio'>>();
	private readonly _inboundVideoTracks = new Map<string, ObservedInboundTrack<'video'>>();
	private readonly _outboundAudioTracks = new Map<string, ObservedOutboundTrack<'audio'>>();
	private readonly _outboundVideoTracks = new Map<string, ObservedOutboundTrack<'video'>>();
	private readonly _execute = createSingleExecutor();
	
	private constructor(
		private readonly _model: Models.PeerConnection,
		public readonly client: ObservedClient,
		private readonly _storageProvider: StorageProvider,
	) {
		super();
	}

	public get peerConnectionId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.peerConnectionId!;
	}

	public get reports() {
		return this.client.reports;
	}

	public get stats(): ObservedPeerConnectionStats | undefined {
		return this._sample;
	}

	public get updated(): number {
		return this._updated;
	}

	public get inboundAudioTracks(): ReadonlyMap<string, ObservedInboundTrack<'audio'>> {
		return this._inboundAudioTracks;
	}

	public get inboundVideoTracks(): ReadonlyMap<string, ObservedInboundTrack<'video'>> {
		return this._inboundVideoTracks;
	}

	public get outboundAudioTracks(): ReadonlyMap<string, ObservedOutboundTrack<'audio'>> {
		return this._outboundAudioTracks;
	}

	public get outboundVideoTracks(): ReadonlyMap<string, ObservedOutboundTrack<'video'>> {
		return this._outboundVideoTracks;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		Array.from(this._inboundAudioTracks.values()).forEach((track) => track.close());
		Array.from(this._inboundVideoTracks.values()).forEach((track) => track.close());
		Array.from(this._outboundAudioTracks.values()).forEach((track) => track.close());
		Array.from(this._outboundVideoTracks.values()).forEach((track) => track.close());

		this._execute(() => this._storageProvider.peerConnectionStorage.remove(this.peerConnectionId))
			.catch(() => void 0)
			.finally(() => this.emit('close')); 
	}

	public update(sample: PeerConnectionTransport, timestamp: number) {
		if (this._closed) return;
		if (sample.transportId !== this._model.peerConnectionId) throw new Error(`TransportId mismatch. PeerConnectionId: ${ this._model.peerConnectionId } TransportId: ${ sample.transportId}`);

		this._sample = sample;

		const report: PeerConnectionTransportReport = {
			serviceId: this.client.call.serviceId,
			roomId: this.client.call.roomId,
			callId: this.client.call.callId,
			clientId: this.client.clientId,
			userId: this.client.userId,
			mediaUnitId: this.client.mediaUnitId,
			...sample,
			timestamp,
			sampleSeq: -1, // deprecated
		};

		this.reports.addPeerConnectionTransportReports(report);
		
		this._updated = timestamp;
		this.emit('update');
	}

	public async createInboundAudioTrack(config: Omit<ObservedInboundTrackConfig<'audio'>, 'kind'>): Promise<ObservedInboundTrack<'audio'>> {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);

		const result = await ObservedInboundTrack.create<'audio'>({
			kind: 'audio',
			trackId: config.trackId,
		}, this, this._storageProvider);

		result.on('close', () => {
			this._inboundAudioTracks.delete(result.trackId);
			this._model.inboundTrackIds = this._model.inboundTrackIds.filter((id) => id !== result.trackId);
			!this._closed &&this._save().catch(() => void 0);
		});
		this._inboundAudioTracks.set(result.trackId, result);
		this._model.inboundTrackIds = [ ...(new Set<string>([ ...this._model.inboundTrackIds, result.trackId ])) ];
		await this._save();

		this.emit('newinboudaudiotrack', result);

		return result;
	}

	public async createInboundVideoTrack(config: Omit<ObservedInboundTrackConfig<'video'>, 'kind'>): Promise<ObservedInboundTrack<'video'>> {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);

		const result = await ObservedInboundTrack.create<'video'>({
			kind: 'video',
			trackId: config.trackId,
		}, this, this._storageProvider);

		result.on('close', () => {
			this._inboundVideoTracks.delete(result.trackId);
			this._model.inboundTrackIds = this._model.inboundTrackIds.filter((id) => id !== result.trackId);
			!this._closed &&this._save().catch(() => void 0);
		});
		this._inboundVideoTracks.set(result.trackId, result);
		this._model.inboundTrackIds = [ ...(new Set<string>([ ...this._model.inboundTrackIds, result.trackId ])) ];
		await this._save();

		this.emit('newinboudvideotrack', result);	
		
		return result;
	}

	public async createOutboundAudioTrack(config: Omit<ObservedOutboundTrackConfig<'audio'>, 'kind'>): Promise<ObservedOutboundTrack<'audio'>> {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = await ObservedOutboundTrack.create<'audio'>({
			kind: 'audio',
			trackId: config.trackId,
		}, this, this._storageProvider);

		result.on('close', () => {
			this._outboundAudioTracks.delete(result.trackId);
			this._model.outboundTrackIds = this._model.outboundTrackIds.filter((id) => id !== result.trackId);
			!this._closed &&this._save().catch(() => void 0);
		});
		this._outboundAudioTracks.set(result.trackId, result);
		this._model.outboundTrackIds = [ ...(new Set<string>([ ...this._model.outboundTrackIds, result.trackId ])) ];
		await this._save();

		this.emit('newoutboundaudiotrack', result);

		return result;
	}

	public async createOutboundVideoTrack(config: Omit<ObservedOutboundTrackConfig<'video'>, 'kind'>): Promise<ObservedOutboundTrack<'video'>> {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		const result = await ObservedOutboundTrack.create<'video'>({
			kind: 'video',
			trackId: config.trackId,
		}, this, this._storageProvider);

		result.on('close', () => {
			this._outboundVideoTracks.delete(result.trackId);
			this._model.outboundTrackIds = this._model.outboundTrackIds.filter((id) => id !== result.trackId);
			!this._closed && this._save().catch(() => void 0);
		});
		this._outboundVideoTracks.set(result.trackId, result);
		this._model.outboundTrackIds = [ ...(new Set<string>([ ...this._model.outboundTrackIds, result.trackId ])) ];
		await this._save();

		this.emit('newoutboundvideotrack', result);
		
		return result;
	}

	private async _save() {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
		
		return this._execute(async () => {
			if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);
			await this._storageProvider.peerConnectionStorage.set(this.peerConnectionId, this._model);
		});
	}
}