import { ClientSample, IceLocalCandidate, IceRemoteCandidate } from '@observertc/sample-schemas-js';
import { ObservedCall } from './ObservedCall';
import * as Models from './models/Models';
import { StorageProvider } from './storages/StorageProvider';
import { EventEmitter } from 'events';
import { createSingleExecutor } from './common/SingleExecutor';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { createLogger } from './common/logger';
import { CallMetaType, createCallMetaReport } from './common/callMetaReports';
// eslint-disable-next-line camelcase
import { Samples_ClientSample_Browser, Samples_ClientSample_Engine, Samples_ClientSample_OperationSystem, Samples_ClientSample_Platform } from './models/samples_pb';
import { isValidUuid } from './common/utils';
import { createClientJoinedEventReport, createClientLeftEventReport } from './common/callEventReports';
import { CallEventType } from './common/CallEventType';

const logger = createLogger('ObservedClient');

export type ObservedClientConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	clientId: string;
	mediaUnitId: string;
	appData: AppData;
	overflowingProcessingThreshold?: number;
	joined?: number,

	/**
	 * before client-monitor-js 3.4.0 the client joined event was generated by the observer, this flag is to keep the compatibility with the old behavior
	 */
	addJoinAndDetachClientEvent?: boolean;
};

export type ObservedClientEvents = {
	update: [],
	close: [],
	'processing-sample-overflow': [],
	newpeerconnection: [ObservedPeerConnection],
	iceconnectionstatechange: [{
		peerConnection: ObservedPeerConnection,
		state: string,
	}],
	icegatheringstatechange: [{
		peerConnection: ObservedPeerConnection,
		state: string,
	}],
	connectionstatechange: [{
		peerConnection: ObservedPeerConnection,
		state: string,
	}],
	selectedcandidatepair: [{
		peerConnection: ObservedPeerConnection,
		localCandidate: IceLocalCandidate,
		remoteCandidate: IceRemoteCandidate,
	}],
};

export declare interface ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> {
	on<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	off<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	once<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	emit<U extends keyof ObservedClientEvents>(event: U, ...args: ObservedClientEvents[U]): boolean;
	readonly appData: AppData;
}

export class ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public static async create<T extends Record<string, unknown> = Record<string, unknown>>(
		config: ObservedClientConfig<T>,
		call: ObservedCall,
		storageProvider: StorageProvider,
	) {
		const { callId, clientId, mediaUnitId } = config;

		const model = new Models.Client({
			roomId: call.roomId,
			serviceId: call.serviceId,
			callId,
			clientId,
			mediaUnitId,
			peerConnectionIds: [],
			joined: BigInt(config.joined ?? Date.now()),
		});

		const result = new ObservedClient<T>(model, call, storageProvider, config.appData);

		const alreadyInserted = await storageProvider.clientStorage.insert(clientId, model);

		if (alreadyInserted) throw new Error(`Client with id ${clientId} already exists`);

		result._overflowingProcessingThreshold = config.overflowingProcessingThreshold ?? 0;

		if (config.addJoinAndDetachClientEvent) {
			call.reports.addCallEventReport(createClientJoinedEventReport(
				call.serviceId,
				result.mediaUnitId,
				call.roomId,
				call.callId,
				result.clientId,
				result.joined,
				result.userId,
				result.marker,
			));
		}

		result.once('close', () => result._addClientLeftReport());

		return result;
	}

	public created = Date.now();

	private readonly _peerConnections = new Map<string, ObservedPeerConnection>();
	private readonly _execute = createSingleExecutor();
	
	private _overflowingProcessingThreshold = 0;
	private _closed = false;
	private _updated = Date.now();
	private _acceptedSample = 0;
	private _processingSample = 0;
	private _timeZoneOffsetInHours?: number;
	private _leaveReported = false;
	private _numberOfAcceptedUpdates = 0;

	public availableOutgoingBitrate = 0;
	public availableIncomingBitrate = 0;
	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;
	public totalSentBytes = 0;
	public totalReceivedBytes = 0;

	public avgRttInMs?: number;
	public sendingBitrate?: number;
	public receivingBitrate?: number;

	public readonly mediaDevices: string[] = [];
	public readonly codecs: string[] = [];
	public readonly userMediaErrors: string[] = [];

	public readonly ωpendingCreatedTracksTimestamp = new Map<string, number>();
	public readonly ωpendingCreatedPeerConnectionTimestamp = new Map<string, number>();
	
	private constructor(
		private readonly _model: Models.Client,
		public readonly call: ObservedCall,
		private readonly _storageProvider: StorageProvider,
		public readonly appData: AppData
	) {
		super();
	}

	public get joined(): number {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Number(this._model.joined!);
	}

	public get clientId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.clientId!;
	}

	public get roomId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.roomId!;
	}

	public get serviceId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get callId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.callId!;
	}

	public get mediaUnitId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.mediaUnitId!;
	}

	public get reports() {
		return this.call.reports;
	}

	public get userId() {
		return this._model.userId;
	}

	public get timeZoneOffsetInHours() {
		return this._timeZoneOffsetInHours;
	}

	public get marker() {
		return this._model.marker;
	}

	public get browser() {
		return this._model.browser;
	}

	public get engine() {
		return this._model.engine;
	}

	public get operationSystem() {
		return this._model.operationSystem;
	}

	public get platform() {
		return this._model.platform;
	}

	public get acceptedSample() {
		return this._acceptedSample;
	}

	public get updated() {
		return this._updated;
	}

	public get numberOfAcceptedUpdates() {
		return this._numberOfAcceptedUpdates;
	}

	public get uptimeInMs() {
		return this._updated - this.created;
	}

	public get closed() {
		return this._closed;
	}

	public get peerConnections(): ReadonlyMap<string, ObservedPeerConnection> {
		return this._peerConnections;
	}
	
	public close() {
		if (this._closed) return;
		this._closed = true;

		Array.from(this._peerConnections.values()).forEach((peerConnection) => peerConnection.close());

		this._execute(() => this._storageProvider.clientStorage.remove(this.clientId))
			.catch(() => void 0)
			.finally(() => this.emit('close'));
	}

	public async accept(sample: ClientSample): Promise<void> {
		if (this._closed) throw new Error(`Client ${this.clientId} is closed`);
		if (sample.clientId && sample.clientId !== 'NULL' && sample.clientId !== this.clientId) {
			throw new Error(`Sample client id (${sample.clientId}) does not match the client id of the observed client (${this.clientId})`);
		}
		++this._acceptedSample;
		++this._processingSample;
		
		if (0 < this._overflowingProcessingThreshold && this._overflowingProcessingThreshold < this._processingSample) {
			this.emit('processing-sample-overflow');
		}

		return this._execute(async () => {
			++this._numberOfAcceptedUpdates;
			
			for (const peerConnection of this._peerConnections.values()) {
				if (peerConnection.closed) continue;
				peerConnection.resetMetrics();
			}

			let executeSave = false;

			if (this.userId !== sample.userId) {
				this._model.userId = sample.userId;
				executeSave = true;
			}
			if (this._model.marker !== sample.marker) {
				this._model.marker = sample.marker;
				executeSave = true;
			}

			if (this._timeZoneOffsetInHours !== sample.timeZoneOffsetInHours) {
				this._timeZoneOffsetInHours = sample.timeZoneOffsetInHours;
				executeSave = true;
			}

			if (sample.os && (
				this._model.operationSystem?.name !== sample.os.name || 
				this._model.operationSystem?.version !== sample.os.version ||
				this._model.operationSystem?.versionName !== sample.os.versionName
			)) {
				this._model.operationSystem = new Samples_ClientSample_OperationSystem({
					...sample.os,
				});
				
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.OPERATION_SYSTEM,
						payload: sample.os,
					}, this.userId);
	
				this.reports.addCallMetaReport(callMetaReport);
				executeSave = true;
			}

			if (sample.engine && (
				this._model.engine?.name !== sample.engine.name || 
				this._model.engine?.version !== sample.engine.version
			)) {
				this._model.engine = new Samples_ClientSample_Engine({
					...sample.engine,
				});
	
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.ENGINE,
						payload: sample.engine,
					}, this.userId);
	
				this.reports.addCallMetaReport(callMetaReport);
				executeSave = true;
			}

			if (sample.platform && (
				this._model.platform?.model !== sample.platform.model || 
				this._model.platform?.type !== sample.platform.type ||
				this._model.platform?.vendor !== sample.platform.vendor
			)) {
				this._model.platform = new Samples_ClientSample_Platform({
					...sample.platform,
				});
	
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.PLATFORM,
						payload: sample.platform,
					}, this.userId);
	
				this.reports.addCallMetaReport(callMetaReport);
				executeSave = true;
			}

			if (sample.browser && (
				this._model.browser?.name !== sample.browser.name || 
				this._model.browser?.version !== sample.browser.version
			)) {
				this._model.browser = new Samples_ClientSample_Browser({
					...sample.browser,
				});
	
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.BROWSER,
						payload: sample.browser,
					}, this.userId);
	
				this.reports.addCallMetaReport(callMetaReport);
				executeSave = true;
			}

			for (const mediaConstraint of sample.mediaConstraints ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.MEDIA_CONSTRAINT,
						payload: mediaConstraint,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}

			for (const localSDP of sample.localSDPs ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, 
					{
						type: CallMetaType.LOCAL_SDP,
						payload: localSDP,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}

			for (const extensionStats of sample.extensionStats ?? []) {
				this.reports.addClientExtensionReport({
					serviceId: this.serviceId,
					mediaUnitId: this.mediaUnitId,
					roomId: this.roomId,
					callId: this.callId,
					clientId: this.clientId,
					userId: this.userId,
					timestamp: Date.now(),
					payload: extensionStats.payload,
					extensionType: extensionStats.type,
				});
			}

			for (const { timestamp, ...callEvent } of sample.customCallEvents ?? []) {
				const peerConnection = this._peerConnections.get(callEvent.peerConnectionId ?? '');
				
				switch (callEvent.name) {
					case CallEventType.CLIENT_JOINED:
						this.created = timestamp ?? this.created;
						break;
					case CallEventType.CLIENT_LEFT:
						this._leaveReported = true;
						break;
					case CallEventType.ICE_CONNECTION_STATE_CHANGED: 
						peerConnection && callEvent.value && this.emit('iceconnectionstatechange', {
							peerConnection,
							state: callEvent.value,
						});
						break;
					case CallEventType.ICE_GATHERING_STATE_CHANGED:
						peerConnection && callEvent.value && this.emit('icegatheringstatechange', {
							peerConnection,
							state: callEvent.value,
						});
						break;
					case CallEventType.PEER_CONNECTION_STATE_CHANGED:
						peerConnection && callEvent.value && this.emit('connectionstatechange', {
							peerConnection,
							state: callEvent.value,
						});
						break;
					case CallEventType.PEER_CONNECTION_OPENED: {
						if (!callEvent.peerConnectionId) break;
						if (peerConnection) {
							peerConnection.created = timestamp ?? peerConnection.created;
						} else {
							this.ωpendingCreatedPeerConnectionTimestamp.set(callEvent.peerConnectionId, timestamp ?? Date.now());
						}
						break;
					}
					case CallEventType.MEDIA_TRACK_ADDED: {
						if (!callEvent.mediaTrackId) break;
						const track = peerConnection?.getTrack(callEvent.mediaTrackId);

						if (track) {
							track.created = timestamp ?? track.created;
						} else {
							this.ωpendingCreatedTracksTimestamp.set(callEvent.mediaTrackId, timestamp ?? Date.now());
						}
					}

				}

				this.reports.addCallEventReport({
					serviceId: this.serviceId,
					mediaUnitId: this.mediaUnitId,
					roomId: this.roomId,
					callId: this.callId,
					clientId: this.clientId,
					userId: this.userId,
					timestamp: timestamp ?? Date.now(),
					...callEvent,
				});
			}

			for (const userMediaError of sample.userMediaErrors ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.USER_MEDIA_ERROR,
						payload: userMediaError,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
				this.userMediaErrors.push(userMediaError);
			}

			for (const certificate of sample.certificates ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.CERTIFICATE,
						payload: certificate,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}
	
			for (const codec of sample.codecs ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.CODEC,
						payload: codec,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
				codec.mimeType && this.codecs.push(codec.mimeType);
			}
	
			for (const iceServer of sample.iceServers ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.ICE_SERVER,
						payload: iceServer,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}
	
			for (const mediaDevice of sample.mediaDevices ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.MEDIA_DEVICE,
						payload: mediaDevice,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
				mediaDevice.label && this.mediaDevices.push(mediaDevice.label);
			}
			
			for (const mediaSource of sample.mediaSources ?? []) {
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.MEDIA_SOURCE,
						payload: mediaSource,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}

			for (const transport of sample.pcTransports ?? []) {
				try {
					const peerConnection = this._peerConnections.get(transport.transportId) ?? await this._createPeerConnection(transport.peerConnectionId);

					peerConnection.update(transport, sample.timestamp); 
				} catch (err) {
					logger.error(`Error creating peer connection: ${(err as Error)?.message}`);
				}
				
			}

			for (const track of sample.inboundAudioTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`InboundAudioTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				try {
					const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

					if (!peerConnection) continue;
	
					const inboundAudioTrack = peerConnection.inboundAudioTracks.get(track.trackId) ?? await peerConnection.createInboundAudioTrack({
						trackId: track.trackId,
						sfuStreamId: track.sfuStreamId,
						sfuSinkId: track.sfuSinkId,
					});
	
					await inboundAudioTrack.update(track, sample.timestamp);
	
					const remoteOutboundTrack = this.call.sfuStreamIdToOutboundAudioTrack.get(track.sfuStreamId ?? '');
	
					if (remoteOutboundTrack && inboundAudioTrack.sfuStreamId && !remoteOutboundTrack.remoteInboundTracks.has(inboundAudioTrack.sfuStreamId)) {
						remoteOutboundTrack.connectInboundTrack(inboundAudioTrack);
					}
				} catch (err) {
					logger.error(`Error creating inbound audio track: ${(err as Error)?.message}`);
				}
			}

			for (const track of sample.inboundVideoTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`InboundVideoTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}
				if (isValidUuid(track.trackId) === false) {
					// mediasoup-probator trackId is not a valid UUID, no need to warn about it
					if (track.trackId === 'probator') continue;
					logger.warn(`InboundVideoTrack with invalid trackId: ${track.trackId}`);
					continue;
				}

				try {
					const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

					if (!peerConnection) continue;
	
					const inboundVideoTrack = peerConnection.inboundVideoTracks.get(track.trackId) ?? await peerConnection.createInboundVideoTrack({
						trackId: track.trackId,
						sfuStreamId: track.sfuStreamId,
						sfuSinkId: track.sfuSinkId,
					});
	
					await inboundVideoTrack.update(track, sample.timestamp);
					
					const remoteOutboundTrack = this.call.sfuStreamIdToOutboundVideoTrack.get(inboundVideoTrack.sfuStreamId ?? '');
	
					if (remoteOutboundTrack && inboundVideoTrack.sfuStreamId && !remoteOutboundTrack.remoteInboundTracks.has(inboundVideoTrack.sfuStreamId)) {
						remoteOutboundTrack.connectInboundTrack(inboundVideoTrack);
					}
				} catch (err) {
					logger.error(`Error creating inbound video track: ${(err as Error)?.message}`);
				}
			}

			for (const track of sample.outboundAudioTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`OutboundAudioTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				try {
					const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

					if (!peerConnection) continue;
	
					const outboundAudioTrack = peerConnection.outboundAudioTracks.get(track.trackId) ?? await peerConnection.createOutboundAudioTrack({
						trackId: track.trackId,
						sfuStreamId: track.sfuStreamId,
					});

					await outboundAudioTrack.update(track, sample.timestamp);
				} catch (err) {
					logger.error(`Error creating outbound audio track: ${(err as Error)?.message}`);
				}
				
			}

			for (const track of sample.outboundVideoTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`OutboundVideoTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				try {
					const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

					if (!peerConnection) continue;
	
					const outboundVideoTrack = peerConnection.outboundVideoTracks.get(track.trackId) ?? await peerConnection.createOutboundVideoTrack({
						trackId: track.trackId,
						sfuStreamId: track.sfuStreamId,
					});
	
					await outboundVideoTrack.update(track, sample.timestamp);

				} catch (err) {
					logger.error(`Error creating outbound video track: ${(err as Error)?.message}`);
				}
			}

			for (const iceLocalCandidate of sample.iceLocalCandidates ?? []) {
				if (!iceLocalCandidate.peerConnectionId) {
					logger.warn(`Local ice candidate without peerConnectionId: ${JSON.stringify(iceLocalCandidate)}`);
					continue;
				}
				const peerConnection = this._peerConnections.get(iceLocalCandidate.peerConnectionId);

				if (!peerConnection) {
					logger.debug(`Peer connection ${iceLocalCandidate.peerConnectionId} not found for ice local candidate ${iceLocalCandidate.id}`);
					continue;
				}

				peerConnection.ICE.addLocalCandidate(iceLocalCandidate);
			}
	
			for (const iceRemoteCandidate of sample.iceRemoteCandidates ?? []) {
				if (!iceRemoteCandidate.peerConnectionId) {
					logger.warn(`Remote ice candidate without peerConnectionId: ${JSON.stringify(iceRemoteCandidate)}`);
					continue;
				}
				const peerConnection = this._peerConnections.get(iceRemoteCandidate.peerConnectionId);

				if (!peerConnection) {
					logger.debug(`Peer connection ${iceRemoteCandidate.peerConnectionId} not found for ice remote candidate ${iceRemoteCandidate.id}`);
					continue;
				}

				peerConnection.ICE.addRemoteCandidate(iceRemoteCandidate);
			}

			for (const candidatePair of sample.iceCandidatePairs ?? []) {
				const peerConnection = this._peerConnections.get(candidatePair.peerConnectionId);

				if (!peerConnection) {
					logger.debug(`Peer connection ${candidatePair.peerConnectionId} not found for ice candidate pair ${candidatePair.localCandidateId}, ${candidatePair.remoteCandidateId}`);

					continue;
				}

				peerConnection.ICE.update(candidatePair, sample.timestamp);
			}

			// close entries that are idle for too long
			if (this.call.observer.config.maxEntryIdleTimeInMs && this._updated < sample.timestamp) {

				for (const peerConnection of this._peerConnections.values()) {
					if (this.call.observer.config.maxEntryIdleTimeInMs < sample.timestamp - peerConnection.updated) {
						logger.debug(`Closing peer connection ${peerConnection.peerConnectionId} due to inactivity`);
						peerConnection.close();

						continue;
					}
					for (const track of peerConnection.inboundAudioTracks.values()) {
						if (this.call.observer.config.maxEntryIdleTimeInMs < sample.timestamp - track.updated) {
							logger.debug(`Closing inbound audio track ${track.trackId} due to inactivity`);
							track.close();
						}
					}
					for (const track of peerConnection.inboundVideoTracks.values()) {
						if (this.call.observer.config.maxEntryIdleTimeInMs < sample.timestamp - track.updated) {
							logger.debug(`Closing inbound video track ${track.trackId} due to inactivity`);
							track.close();
						}
					}
					for (const track of peerConnection.outboundAudioTracks.values()) {
						if (this.call.observer.config.maxEntryIdleTimeInMs < sample.timestamp - track.updated) {
							logger.debug(`Closing outbound audio track ${track.trackId} due to inactivity`);
							track.close();
						}
					}
				}
			}

			// update metrics
			this.availableIncomingBitrate = 0;
			this.availableOutgoingBitrate = 0;
			this.totalSentBytes = 0;
			this.totalReceivedBytes = 0;
			this.totalOutboundPacketsSent = 0;
			this.totalInboundPacketsReceived = 0;
			this.totalInboundPacketsLost = 0;
			this.totalDataChannelBytesSent = 0;
			this.totalDataChannelBytesReceived = 0;
			this.sendingBitrate = 0;
			this.receivingBitrate = 0;
			let sumRttInMs = 0;

			for (const peerConnection of this._peerConnections.values()) {
				if (peerConnection.closed) continue;
				peerConnection.updateMetrics();
				this.totalSentBytes += peerConnection.totalSentAudioBytes + peerConnection.totalSentVideoBytes;
				this.totalReceivedBytes += peerConnection.totalReceivedAudioBytes + peerConnection.totalReceivedVideoBytes;
				this.totalOutboundPacketsSent += peerConnection.totalOutboundPacketsSent;
				this.totalInboundPacketsReceived += peerConnection.totalInboundPacketsReceived;
				this.totalInboundPacketsLost += peerConnection.totalInboundPacketsLost;
				this.totalDataChannelBytesSent += peerConnection.totalDataChannelBytesSent;
				this.totalDataChannelBytesReceived += peerConnection.totalDataChannelBytesReceived;
				this.sendingBitrate += peerConnection.sendingAudioBitrate + peerConnection.sendingVideoBitrate;
				this.receivingBitrate += peerConnection.receivingAudioBitrate + peerConnection.receivingVideoBitrate;
				this.availableIncomingBitrate += peerConnection.availableIncomingBitrate ?? 0;
				this.availableOutgoingBitrate += peerConnection.availableOutgoingBitrate ?? 0;
				sumRttInMs += peerConnection.avgRttInMs ?? 0;
			}

			this.avgRttInMs = this._peerConnections.size ? sumRttInMs / this._peerConnections.size : undefined;
			
			if (executeSave) await this._save();

			this._updated = sample.timestamp;
			this.emit('update');
		}).finally(() => {
			--this._processingSample;
		});
	}

	private async _createPeerConnection(peerConnectionId: string): Promise<ObservedPeerConnection> {
		const result = await ObservedPeerConnection.create({
			peerConnectionId,
		}, this, this._storageProvider);

		const pendingTracksTimestamp = this.ωpendingCreatedTracksTimestamp.get(peerConnectionId);

		if (pendingTracksTimestamp) {
			result.created = pendingTracksTimestamp;
			this.ωpendingCreatedTracksTimestamp.delete(peerConnectionId);
		}

		const onNewSelectedCandidatePair = ({ localCandidate, remoteCandidate }: { localCandidate: IceLocalCandidate, remoteCandidate: IceRemoteCandidate }) => {
			this.emit('selectedcandidatepair', {
				peerConnection: result,
				localCandidate,
				remoteCandidate,
			});
		};

		result.once('close', () => {
			result.ICE.off('new-selected-candidate-pair', onNewSelectedCandidatePair);
			this._peerConnections.delete(peerConnectionId);
			this._model.peerConnectionIds = this._model.peerConnectionIds.filter((id) => id !== peerConnectionId);
			this._save().catch(() => void 0);
		});
		result.ICE.on('new-selected-candidate-pair', onNewSelectedCandidatePair);
		this._peerConnections.set(peerConnectionId, result);
		this._model.peerConnectionIds.push(peerConnectionId);
		await this._save();

		this.emit('newpeerconnection', result);

		return result;
	}

	private async _save() {
		if (this._closed) throw new Error(`Client ${this.clientId} is closed`);
		
		return this._storageProvider.clientStorage.set(this.clientId, this._model);
	}

	private _addClientLeftReport() {
		if (this._leaveReported) return;
		this._leaveReported = true;

		this.reports.addCallEventReport(createClientLeftEventReport(
			this.serviceId,
			this.mediaUnitId,
			this.roomId,
			this.callId,
			this.clientId,
			this.joined,
			this.userId,
			this.marker,
		));
	}
}