import { EventEmitter } from 'events';
import { StorageProvider } from './storages/StorageProvider';
import * as Models from './models/Models';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { OutboundAudioTrack, OutboundVideoTrack } from '@observertc/sample-schemas-js';
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { OutboundAudioTrackReport, OutboundVideoTrackReport } from '@observertc/report-schemas-js';
import { MediaKind } from './common/types';
import { createSingleExecutor } from './common/SingleExecutor';

export type ObservedOutboundTrackConfig<K extends MediaKind> = {
	trackId: string;
	kind: K;
	sfuStreamId?: string;
}

export type ObservedOutboundTrackEvents = {
	update: [],
	close: [],
};

export type ObservedOutboundTrackStatsUpdate<K extends MediaKind> = K extends 'audio' ? OutboundAudioTrack : OutboundVideoTrack;

export type ObservedOutboundTrackStats<K extends MediaKind> = ObservedOutboundTrackStatsUpdate<K> & {
	ssrc: number;
	bitrate: number;
	rttInMs?: number;
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
	public static async create<K extends MediaKind>(
		config: ObservedOutboundTrackConfig<K>,
		peerConnection: ObservedPeerConnection,
		storageProvider: StorageProvider,
	) {
		const model = new Models.OutboundTrack({
			serviceId: peerConnection.client.serviceId,
			roomId: peerConnection.client.roomId,
			callId: peerConnection.client.callId,
			clientId: peerConnection.client.clientId,
			mediaUnitId: peerConnection.client.mediaUnitId,
			peerConnectionId: peerConnection.peerConnectionId,
			trackId: config.trackId,
			kind: config.kind,
			sfuStreamId: config.sfuStreamId,
		});

		const alreadyInserted = await storageProvider.outboundTrackStorage.insert(config.trackId, model);

		if (alreadyInserted) throw new Error(`OutboundAudioTrack with id ${config.trackId} already exists`);

		return new ObservedOutboundTrack<K>(model, peerConnection, storageProvider);
	}

	public bitrate?: number;
	public rttInMs?: number;

	private readonly _stats = new Map<number, ObservedOutboundTrackStats<Kind>>();
	private readonly _execute = createSingleExecutor();
	
	private _closed = false;
	private _updated = Date.now();
	private _remoteInboundTracks = new Map<string, ObservedInboundTrack<Kind>>();

	private constructor(
		private readonly _model: Models.OutboundTrack,
		public readonly peerConnection: ObservedPeerConnection,
		private readonly _storageProvider: StorageProvider,
	) {
		super();
	}

	public get kind(): Kind {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.kind! as Kind;
	}
	
	public get trackId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.trackId!;
	}

	public get sfuStreamId() {
		return this._model.sfuStreamId;
	}

	public get closed() {
		return this._closed;
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

	public close() {
		if (this._closed) return;

		this._closed = true;

		this._execute(() => this._storageProvider.inboundTrackStorage.remove(this.trackId))
			.catch(() => void 0)
			.finally(() => this.emit('close'));
	}

	public get stats(): ReadonlyMap<number, ObservedOutboundTrackStats<Kind>> {
		return this._stats;
	}

	public async update(sample: ObservedOutboundTrackStatsUpdate<Kind>, timestamp: number): Promise<void> {
		if (this._closed) return;
		let executeSave = false;

		const report: OutboundAudioTrackReport | OutboundVideoTrackReport = {
			serviceId: this.peerConnection.client.serviceId,
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

		if (this.kind === 'audio') this.reports.addOutboundAudioTrackReport(report);
		else if (this.kind === 'video') this.reports.addOutboundVideoTrackReport(report);

		const elapsedTimeInMs = Math.max(1, timestamp - this._updated);
		const lastStat = this._stats.get(sample.ssrc);
		const rttInMs = sample.roundTripTime ? sample.roundTripTime * 1000 : undefined;
		const bitrate = ((sample.bytesSent ?? 0) - (lastStat?.bytesSent ?? 0)) * 8 / (elapsedTimeInMs / 1000);
		// const lostPackets = (sample.packetsLost ?? 0) - (lastStat?.packetsLost ?? 0);
		// const sentPackets = (sample.packetsSent ?? 0) - (lastStat?.packetsSent ?? 0);
		const stats: ObservedOutboundTrackStats<Kind> = {
			...sample,
			rttInMs,
			bitrate,
			ssrc: sample.ssrc,
		};

		this._stats.set(sample.ssrc, stats);

		this.bitrate = [ ...this._stats.values() ].reduce((acc, stat) => acc + stat.bitrate, 0);
		this.rttInMs = [ ...this._stats.values() ].reduce((acc, stat) => acc + (stat.rttInMs ?? 0), 0) / (this._stats.size || 1);

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

			executeSave = true;
		}

		if (executeSave) await this._save();

		this._updated = timestamp;
		this.emit('update');
	}

	public connectInboundTrack(track: ObservedInboundTrack<Kind>) {
		if (this._closed) return;

		track.remoteOutboundTrack = this;
		track.once('close', () => {
			this._remoteInboundTracks.delete(track.trackId);
		});

		this._remoteInboundTracks.set(track.trackId, track);
	}

	private async _save() {
		if (this._closed) throw new Error(`OutboundTrack ${this.trackId} is closed`);
		
		return this._storageProvider.outboundTrackStorage.set(this.trackId, this._model);
	}
}
