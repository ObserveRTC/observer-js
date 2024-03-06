import { EventEmitter } from 'events';
import * as Models from './models/Models';
import { StorageProvider } from './storages/StorageProvider';
import { IceLocalCandidate, IceRemoteCandidate, PeerConnectionTransport } from '@observertc/sample-schemas-js';
import { ObservedClient } from './ObservedClient';
import { ObservedInboundTrack, ObservedInboundTrackConfig } from './ObservedInboundTrack';
import { ObservedOutboundTrack, ObservedOutboundTrackConfig } from './ObservedOutboundTrack';
import { PeerConnectionTransportReport } from '@observertc/report-schemas-js';
import { createSingleExecutor } from './common/SingleExecutor';
import { ObservedICE } from './ObservedICE';

export type ObservedPeerConnectionEvents = {
	update: [],
	close: [],
	newinboudaudiotrack: [ObservedInboundTrack<'audio'>],
	newinboudvideotrack: [ObservedInboundTrack<'video'>],
	newoutboundaudiotrack: [ObservedOutboundTrack<'audio'>],
	newoutboundvideotrack: [ObservedOutboundTrack<'video'>],

	iceconnectionstatechange: [string],
	icegatheringstatechange: [string],
	connectionstatechange: [string],
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

	public created = Date.now();

	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;

	public totalSentAudioBytes = 0;
	public totalSentVideoBytes = 0;
	public totalSentAudioPackets = 0;
	public totalSentVideoPackets = 0;
	public totalReceivedAudioPacktes = 0;
	public totalReceivedVideoPackets = 0;
	public totalReceivedAudioBytes = 0;
	public totalReceivedVideoBytes = 0;

	public deltaInboundLostPackets = 0;
	public deltaInboundReceivedPackets = 0;
	public deltaOutboundSentPackets = 0;
	public deltaDataChannelBytesSent = 0;
	public deltaDataChannelBytesReceived = 0;
	public deltaInboundReceivedBytes = 0;
	public deltaOutboundSentBytes = 0;
	
	public deltaReceivedAudioBytes = 0;
	public deltaReceivedVideoBytes = 0;
	public deltaReceivedAudioPackets = 0;
	public deltaReceivedVideoPackets = 0;
	public deltaSentAudioBytes = 0;
	public deltaSentVideoBytes = 0;
	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;
    
	public avgRttInS?: number;

	private _closed = false;
	private _updated = Date.now();
	private _sample?: ObservedPeerConnectionStats;
	private _selectedLocalIceCandidate?: IceLocalCandidate;
	private _selectedRemoteIceCandidate?: IceRemoteCandidate;

	public readonly ICE = ObservedICE.create(this);
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

	public get selectedLocalIceCandidate() {
		return this._selectedLocalIceCandidate;
	}

	public get selectedRemoteIceCandidate() {
		return this._selectedRemoteIceCandidate;
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

	public get uptimeInMs() {
		return this._updated - this.created;
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

	public getTrack(trackId: string): ObservedInboundTrack<'audio'> | ObservedInboundTrack<'video'> | ObservedOutboundTrack<'audio'> | ObservedOutboundTrack<'video'> | undefined {
		return this._inboundAudioTracks.get(trackId) ?? this._inboundVideoTracks.get(trackId) ?? this._outboundAudioTracks.get(trackId) ?? this._outboundVideoTracks.get(trackId);
	}

	public resetMetrics() {
		this.deltaInboundLostPackets = 0;
		this.deltaInboundReceivedPackets = 0;
		this.deltaOutboundSentPackets = 0;

		this.deltaDataChannelBytesSent = 0;
		this.deltaDataChannelBytesReceived = 0;
		this.deltaReceivedAudioBytes = 0;
		this.deltaReceivedVideoBytes = 0;
		this.deltaSentAudioBytes = 0;
		this.deltaSentVideoBytes = 0;

		this._inboundAudioTracks.forEach((track) => track.resetMetrics());
		this._inboundVideoTracks.forEach((track) => track.resetMetrics());
		this._outboundAudioTracks.forEach((track) => track.resetMetrics());
		this._outboundVideoTracks.forEach((track) => track.resetMetrics());
	}

	public updateMetrics() {
		this.totalInboundPacketsLost = 0;
		this.totalInboundPacketsReceived = 0;
		this.totalOutboundPacketsSent = 0;
		this.totalDataChannelBytesSent = 0;
		this.totalDataChannelBytesReceived = 0;
	
		this.totalSentAudioBytes = 0;
		this.totalSentVideoBytes = 0;
		this.totalReceivedAudioBytes = 0;
		this.totalReceivedVideoBytes = 0;
		this.sendingAudioBitrate = 0;
		this.sendingVideoBitrate = 0;
		this.receivingAudioBitrate = 0;
		this.receivingVideoBitrate = 0;

		let sumRttInS = 0;

		this._inboundAudioTracks.forEach((track) => {
			this.deltaInboundLostPackets += track.deltaLostPackets;
			this.deltaInboundReceivedPackets += track.deltaReceivedPackets;
			this.deltaInboundReceivedBytes += track.deltaBytesReceived;
			
			this.deltaReceivedAudioBytes += track.deltaBytesReceived;
			this.deltaReceivedAudioPackets += track.deltaReceivedPackets;
			
			this.receivingAudioBitrate += track.bitrate;

			this.totalInboundPacketsLost += track.totalLostPackets;
			this.totalInboundPacketsReceived += track.totalReceivedPackets;
			this.totalReceivedAudioBytes += track.totalBytesReceived;
			this.totalReceivedAudioPacktes += track.totalReceivedPackets;

			sumRttInS = (track.rttInMs ?? 0) / 1000.0;
		});

		this._inboundVideoTracks.forEach((track) => {
			this.deltaInboundLostPackets += track.deltaLostPackets;
			this.deltaInboundReceivedPackets += track.deltaReceivedPackets;
			this.deltaInboundReceivedBytes += track.deltaBytesReceived;
			
			this.deltaReceivedVideoBytes += track.deltaBytesReceived;
			this.deltaReceivedVideoPackets += track.deltaReceivedPackets;
			
			this.receivingVideoBitrate += track.bitrate;

			this.totalInboundPacketsLost += track.totalLostPackets;
			this.totalInboundPacketsReceived += track.totalReceivedPackets;
			this.totalReceivedVideoBytes += track.totalBytesReceived;
			this.totalReceivedVideoPackets += track.totalReceivedPackets;

			sumRttInS = (track.rttInMs ?? 0) / 1000.0;
		});

		this._outboundAudioTracks.forEach((track) => {
			this.deltaOutboundSentPackets += track.deltaSentPackets;
			this.deltaOutboundSentBytes += track.deltaSentBytes;
			
			this.deltaSentAudioBytes += track.deltaSentBytes;
			this.deltaSentAudioBytes += track.deltaSentPackets;
			
			this.sendingAudioBitrate += track.bitrate;

			this.totalOutboundPacketsSent += track.totalSentPackets;
			this.totalSentAudioBytes += track.totalSentBytes;
			this.totalSentAudioPackets += track.totalSentPackets;

			sumRttInS = (track.rttInMs ?? 0) / 1000.0;
		});

		this._outboundVideoTracks.forEach((track) => {
			this.deltaOutboundSentPackets += track.deltaSentPackets;
			this.deltaOutboundSentBytes += track.deltaSentBytes;
			
			this.deltaSentVideoBytes += track.deltaSentBytes;
			this.deltaSentVideoBytes += track.deltaSentPackets;
			
			this.sendingVideoBitrate += track.bitrate;

			this.totalOutboundPacketsSent += track.totalSentPackets;
			this.totalSentVideoBytes += track.totalSentBytes;
			this.totalSentVideoPackets += track.totalSentPackets;

			sumRttInS = (track.rttInMs ?? 0) / 1000.0;
		});

		const nrOfBelongings = this._inboundAudioTracks.size + this._inboundVideoTracks.size + this._outboundAudioTracks.size + this._outboundVideoTracks.size;

		this.avgRttInS = 0 < nrOfBelongings ? sumRttInS / nrOfBelongings : undefined;
	}

	public update(sample: PeerConnectionTransport, timestamp: number) {
		if (this._closed) return;
		if (sample.peerConnectionId !== this._model.peerConnectionId) throw new Error(`TransportId mismatch. PeerConnectionId: ${ this._model.peerConnectionId } TransportId: ${ sample.transportId}`);

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

	public updateSelectedCandidate(localCandidate: IceLocalCandidate, remoteCandidate: IceRemoteCandidate) {
		this._selectedLocalIceCandidate = localCandidate;
		this._selectedRemoteIceCandidate = remoteCandidate;
	}

	public async createInboundAudioTrack(config: Omit<ObservedInboundTrackConfig<'audio'>, 'kind'>): Promise<ObservedInboundTrack<'audio'>> {
		if (this._closed) throw new Error(`PeerConnection ${this.peerConnectionId} is closed`);

		const result = await ObservedInboundTrack.create<'audio'>({
			kind: 'audio',
			trackId: config.trackId,
		}, this, this._storageProvider);

		const pendingTracksTimestamp = this.client.ωpendingCreatedTracksTimestamp.get(result.trackId);

		if (pendingTracksTimestamp) {
			this.client.ωpendingCreatedTracksTimestamp.delete(result.trackId);
			result.created = pendingTracksTimestamp;
		}
		
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
		
		const pendingTracksTimestamp = this.client.ωpendingCreatedTracksTimestamp.get(result.trackId);

		if (pendingTracksTimestamp) {
			this.client.ωpendingCreatedTracksTimestamp.delete(result.trackId);
			result.created = pendingTracksTimestamp;
		}

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

		const pendingTracksTimestamp = this.client.ωpendingCreatedTracksTimestamp.get(result.trackId);

		if (pendingTracksTimestamp) {
			this.client.ωpendingCreatedTracksTimestamp.delete(result.trackId);
			result.created = pendingTracksTimestamp;
		}

		result.on('close', () => {
			this._outboundAudioTracks.delete(result.trackId);
			this._model.outboundTrackIds = this._model.outboundTrackIds.filter((id) => id !== result.trackId);
			
			result.sfuStreamId && this.client.call.sfuStreamIdToOutboundAudioTrack.delete(result.sfuStreamId);
			!this._closed &&this._save().catch(() => void 0);
		});
		this._outboundAudioTracks.set(result.trackId, result);
		this._model.outboundTrackIds = [ ...(new Set<string>([ ...this._model.outboundTrackIds, result.trackId ])) ];
		
		result.sfuStreamId && this.client.call.sfuStreamIdToOutboundAudioTrack.set(result.sfuStreamId, result);
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

		const pendingTracksTimestamp = this.client.ωpendingCreatedTracksTimestamp.get(result.trackId);

		if (pendingTracksTimestamp) {
			this.client.ωpendingCreatedTracksTimestamp.delete(result.trackId);
			result.created = pendingTracksTimestamp;
		}

		result.on('close', () => {
			this._outboundVideoTracks.delete(result.trackId);
			result.sfuStreamId && this.client.call.sfuStreamIdToOutboundVideoTrack.set(result.sfuStreamId, result);
			this._model.outboundTrackIds = this._model.outboundTrackIds.filter((id) => id !== result.trackId);
			!this._closed && this._save().catch(() => void 0);
		});
		this._outboundVideoTracks.set(result.trackId, result);
		result.sfuStreamId && this.client.call.sfuStreamIdToOutboundVideoTrack.set(result.sfuStreamId, result);
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