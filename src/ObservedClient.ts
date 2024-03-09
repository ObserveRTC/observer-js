import { Browser, ClientSample, Engine, IceLocalCandidate, IceRemoteCandidate, OperationSystem, Platform } from '@observertc/sample-schemas-js';
import { ObservedCall } from './ObservedCall';
import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { createLogger } from './common/logger';
import { CallMetaType, createCallMetaReport } from './common/callMetaReports';
// eslint-disable-next-line camelcase
import { isValidUuid } from './common/utils';
import { createClientLeftEventReport } from './common/callEventReports';
import { CallEventType } from './common/CallEventType';

const logger = createLogger('ObservedClient');

export type ObservedClientModel= {
	clientId: string;
	mediaUnitId: string;
	userId?: string,
	marker?: string,
	operationSystem?: OperationSystem,
	engine?: Engine,
	platform?: Platform,
	browser?: Browser,
};

export type ObservedClientEvents = {
	update: [],
	close: [],
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
	usingturn: [boolean],
};

export declare interface ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> {
	on<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	off<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	once<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	emit<U extends keyof ObservedClientEvents>(event: U, ...args: ObservedClientEvents[U]): boolean;
	readonly appData: AppData;
}

export class ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	
	public readonly created = Date.now();
	public _updated = Date.now();

	private readonly _peerConnections = new Map<string, ObservedPeerConnection>();
	
	private _closed = false;
	
	private _acceptedSample = 0;
	private _timeZoneOffsetInHours?: number;
	private _left?: number;
	
	public usingTURN = false;
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
	
	public constructor(
		private readonly _model: ObservedClientModel,
		public readonly call: ObservedCall,
		public readonly appData: AppData
	) {
		super();
	}

	public get clientId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.clientId!;
	}

	public get roomId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.call.roomId!;
	}

	public get serviceId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.call.serviceId!;
	}

	public get callId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.call.callId!;
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

	public get closed() {
		return this._closed;
	}

	public get peerConnections(): ReadonlyMap<string, ObservedPeerConnection> {
		return this._peerConnections;
	}
	
	public close() {
		if (this._closed) return;
		this._closed = true;

		if (!this._left) {
			this._addClientLeftReport();
		}

		Array.from(this._peerConnections.values()).forEach((peerConnection) => peerConnection.close());

		this.emit('close');
	}

	public accept(sample: ClientSample): void {
		if (this._closed) throw new Error(`Client ${this.clientId} is closed`);
		if (sample.clientId && sample.clientId !== 'NULL' && sample.clientId !== this.clientId) {
			throw new Error(`Sample client id (${sample.clientId}) does not match the client id of the observed client (${this.clientId})`);
		}
		const now = Date.now();

		++this._acceptedSample;
		
		for (const peerConnection of this._peerConnections.values()) {
			if (peerConnection.closed) continue;
			peerConnection.resetMetrics();
		}

		if (this.userId !== sample.userId) {
			this._model.userId = sample.userId;
		}
		if (this._model.marker !== sample.marker) {
			this._model.marker = sample.marker;
		}

		if (this._timeZoneOffsetInHours !== sample.timeZoneOffsetInHours) {
			this._timeZoneOffsetInHours = sample.timeZoneOffsetInHours;
		}

		if (sample.os && (
			this._model.operationSystem?.name !== sample.os.name || 
				this._model.operationSystem?.version !== sample.os.version ||
				this._model.operationSystem?.versionName !== sample.os.versionName
		)) {
			this._model.operationSystem = sample.os;
				
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
		}

		if (sample.engine && (
			this._model.engine?.name !== sample.engine.name || 
				this._model.engine?.version !== sample.engine.version
		)) {
			this._model.engine = sample.engine;
	
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
		}

		if (sample.platform && (
			this._model.platform?.model !== sample.platform.model || 
				this._model.platform?.type !== sample.platform.type ||
				this._model.platform?.vendor !== sample.platform.vendor
		)) {
			this._model.platform = sample.platform;
	
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
		}

		if (sample.browser && (
			this._model.browser?.name !== sample.browser.name || 
				this._model.browser?.version !== sample.browser.version
		)) {
			this._model.browser = sample.browser;
	
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
			switch (callEvent.name) {
				case CallEventType.CLIENT_LEFT: {
					this._left = timestamp;
					break;
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
				const peerConnection = this._peerConnections.get(transport.transportId) ?? this._createPeerConnection(transport.peerConnectionId);

				!peerConnection.label && transport.label && (peerConnection.label = transport.label);
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
				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;
	
				const inboundAudioTrack = peerConnection.inboundAudioTracks.get(track.trackId) ?? peerConnection.createInboundAudioTrack({
					trackId: track.trackId,
					sfuStreamId: track.sfuStreamId,
					sfuSinkId: track.sfuSinkId,
				});
	
				inboundAudioTrack.update(track, sample.timestamp);
	
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
				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;
	
				const inboundVideoTrack = peerConnection.inboundVideoTracks.get(track.trackId) ?? peerConnection.createInboundVideoTrack({
					trackId: track.trackId,
					sfuStreamId: track.sfuStreamId,
					sfuSinkId: track.sfuSinkId,
				});
	
				inboundVideoTrack.update(track, sample.timestamp);
					
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
				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;
	
				const outboundAudioTrack = peerConnection.outboundAudioTracks.get(track.trackId) ?? peerConnection.createOutboundAudioTrack({
					trackId: track.trackId,
					sfuStreamId: track.sfuStreamId,
				});

				outboundAudioTrack.update(track, sample.timestamp);
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
				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;
	
				const outboundVideoTrack = peerConnection.outboundVideoTracks.get(track.trackId) ?? peerConnection.createOutboundVideoTrack({
					trackId: track.trackId,
					sfuStreamId: track.sfuStreamId,
				});
	
				outboundVideoTrack.update(track, sample.timestamp);

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

		for (const dataChannel of sample.dataChannels ?? []) {
			if (!dataChannel.peerConnectionId || !dataChannel.dataChannelIdentifier) {
				logger.warn(`DataChannel without peerConnectionId or dataChannelIdentifier: ${JSON.stringify(dataChannel)}`);

				continue;
			}

			try {
				const peerConnection = this._peerConnections.get(dataChannel.peerConnectionId) ?? this._createPeerConnection(dataChannel.peerConnectionId);

				if (!peerConnection) continue;
	
				const observedDataChannel = peerConnection.dataChannels.get(dataChannel.dataChannelIdentifier) ?? peerConnection.createDataChannel(dataChannel.dataChannelIdentifier);
	
				observedDataChannel.update(dataChannel, sample.timestamp);
			} catch (err) {
				logger.error(`Error creating data channel: ${(err as Error)?.message}`);
			}
		}

		// close entries that are idle for too long
		if (this.call.observer.config.maxEntryIdleTimeInMs && this._updated < sample.timestamp) {

			for (const peerConnection of this._peerConnections.values()) {
				if (this.call.observer.config.maxEntryIdleTimeInMs < peerConnection.created - peerConnection.updated) {
					logger.debug(`Closing peer connection ${peerConnection.peerConnectionId} due to inactivity`);
					peerConnection.close();

					continue;
				}
				for (const track of peerConnection.inboundAudioTracks.values()) {
					if (this.call.observer.config.maxEntryIdleTimeInMs < track.created - track.updated) {
						logger.debug(`Closing inbound audio track ${track.trackId} due to inactivity`);
						track.close();
					}
				}
				for (const track of peerConnection.inboundVideoTracks.values()) {
					if (this.call.observer.config.maxEntryIdleTimeInMs < track.created - track.updated) {
						logger.debug(`Closing inbound video track ${track.trackId} due to inactivity`);
						track.close();
					}
				}
				for (const track of peerConnection.outboundAudioTracks.values()) {
					if (this.call.observer.config.maxEntryIdleTimeInMs < track.created - track.updated) {
						logger.debug(`Closing outbound audio track ${track.trackId} due to inactivity`);
						track.close();
					}
				}
				for (const dataChannel of peerConnection.dataChannels.values()) {
					if (this.call.observer.config.maxEntryIdleTimeInMs < dataChannel.created - dataChannel.updated) {
						logger.debug(`Closing DataChannel ${dataChannel.channelId} due to inactivity`);
						dataChannel.close();
					}
				}
			}
		}

		// update metrics
		const wasUsingTURN = this.usingTURN;

		this.usingTURN = false;
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

			if (peerConnection.usingTURN) this.usingTURN = true;
		}

		this.avgRttInMs = this._peerConnections.size ? sumRttInMs / this._peerConnections.size : undefined;
			
		if (wasUsingTURN !== this.usingTURN) this.emit('usingturn', this.usingTURN);

		this._updated = now;
		this.emit('update');
	}

	private _createPeerConnection(peerConnectionId: string, label?: string): ObservedPeerConnection {
		const result = new ObservedPeerConnection({
			peerConnectionId,
			label,
		}, this);

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
		});
		result.ICE.on('new-selected-candidate-pair', onNewSelectedCandidatePair);
		this._peerConnections.set(peerConnectionId, result);

		this.emit('newpeerconnection', result);

		return result;
	}

	private _addClientLeftReport() {
		if (this._left) return;
		this._left = Date.now();

		this.reports.addCallEventReport(createClientLeftEventReport(
			this.serviceId,
			this.mediaUnitId,
			this.roomId,
			this.callId,
			this.clientId,
			this._left,
			this.userId,
			this.marker,
		));
	}
}