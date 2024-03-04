import { ClientSample, IceLocalCandidate } from '@observertc/sample-schemas-js';
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
import { ObservedInboundTrack } from './ObservedInboundTrack';
import { IceCandidatePairReport } from '@observertc/report-schemas-js';

const logger = createLogger('ObservedClient');

export type ObservedClientConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	clientId: string;
	mediaUnitId: string;
	appData: AppData;
	overflowingProcessingThreshold?: number;
};

export type ObservedClientEvents = {
	update: [],
	close: [],
	'processing-sample-overflow': [],
	'candidate-pair-change': [],
	newpeerconnection: [ObservedPeerConnection],
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
		});

		const result = new ObservedClient<T>(model, call, storageProvider, config.appData);

		const alreadyInserted = await storageProvider.clientStorage.insert(clientId, model);

		if (alreadyInserted) throw new Error(`Client with id ${clientId} already exists`);

		result._overflowingProcessingThreshold = config.overflowingProcessingThreshold ?? 0;

		return result;
	}

	private readonly _peerConnections = new Map<string, ObservedPeerConnection>();
	private readonly _execute = createSingleExecutor();
	
	private _overflowingProcessingThreshold = 0;
	private _closed = false;
	private _acceptedSample = 0;
	private _processingSample = 0;
	private _iceLocalCandidate?: IceLocalCandidate;
	private _iceRemoteCandidate?: IceLocalCandidate;

	private constructor(
		private readonly _model: Models.Client,
		public readonly call: ObservedCall,
		private readonly _storageProvider: StorageProvider,
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

	public get iceLocalCandidate() {
		return this._iceLocalCandidate;
	}

	public get iceRemoteCandidate() {
		return this._iceRemoteCandidate;
	}

	public get marker() {
		return this._model.marker;
	}

	public get closed() {
		return this._closed;
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
		if (sample.clientId !== this.clientId) {
			throw new Error(`Sample client id (${sample.clientId}) does not match the client id of the observed client (${this.clientId})`);
		}
		++this._acceptedSample;
		++this._processingSample;
		
		if (0 < this._overflowingProcessingThreshold && this._overflowingProcessingThreshold < this._processingSample) {
			this.emit('processing-sample-overflow');
		}

		return this._execute(async () => {
			if (this.userId !== sample.userId) {
				this._model.userId = sample.userId;
			}
			if (this._model.marker !== sample.marker) {
				this._model.marker = sample.marker;
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

			for (const { timestamp = Date.now(), ...callEvent } of sample.customCallEvents ?? []) {
				this.reports.addCallEventReport({
					serviceId: this.serviceId,
					mediaUnitId: this.mediaUnitId,
					roomId: this.roomId,
					callId: this.callId,
					clientId: this.clientId,
					userId: this.userId,
					timestamp,
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
			let selectedLocalCandidateId: string | undefined;
			let selectedRemoteCandidateId: string | undefined;

			for (const candidatePair of sample.iceCandidatePairs ?? []) {
				if (candidatePair.nominated) {
					if (!selectedLocalCandidateId) selectedLocalCandidateId = candidatePair.localCandidateId;
					if (!selectedRemoteCandidateId) selectedRemoteCandidateId = candidatePair.remoteCandidateId;
				}

				const report: IceCandidatePairReport = {
					serviceId: this.serviceId,
					mediaUnitId: this.mediaUnitId,
					roomId: this.roomId,
					callId: this.callId,
					clientId: this.clientId,
					userId: this.userId,
					timestamp: sample.timestamp,
					...candidatePair,
					sampleSeq: -1, // deprecated
				};
		
				this.reports.addIceCandidatePairReport(report);
			}
	
			let changeIceCandidatePair = false;

			for (const iceLocalCandidate of sample.iceLocalCandidates ?? []) {
				if (
					iceLocalCandidate.id && selectedLocalCandidateId &&
					iceLocalCandidate.id === selectedLocalCandidateId && 
					this._iceLocalCandidate?.id !== iceLocalCandidate.id
				) {
					this._iceLocalCandidate = iceLocalCandidate;
					changeIceCandidatePair = true;
				}
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.ICE_LOCAL_CANDIDATE,
						payload: iceLocalCandidate,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}
	
			for (const iceRemoteCandidate of sample.iceRemoteCandidates ?? []) {
				if (
					iceRemoteCandidate.id && selectedRemoteCandidateId &&
					iceRemoteCandidate.id === selectedRemoteCandidateId && 
					this._iceRemoteCandidate?.id !== iceRemoteCandidate.id
				) {
					this._iceRemoteCandidate = iceRemoteCandidate;
					changeIceCandidatePair = true;
				}
				const callMetaReport = createCallMetaReport(
					this.serviceId, 
					this.mediaUnitId, 
					this.roomId, 
					this.callId, 
					this.clientId, {
						type: CallMetaType.ICE_REMOTE_CANDIDATE,
						payload: iceRemoteCandidate,
					}, this.userId);

				this.reports.addCallMetaReport(callMetaReport);
			}

			for (const transport of sample.pcTransports ?? []) {
				const peerConnection = this._peerConnections.get(transport.transportId) ?? await this._createPeerConnection(transport.peerConnectionId);

				peerConnection.update(transport, sample.timestamp); 
			}

			const remoteInboundAudioTracks = new Map<string | number, ObservedInboundTrack<'audio'>>();
			const remoteInboundVideoTracks = new Map<string | number, ObservedInboundTrack<'video'>>();

			for (const track of sample.inboundAudioTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`InboundAudioTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;

				const inboundAudioTrack = peerConnection.inboundAudioTracks.get(track.trackId) ?? await peerConnection.createInboundAudioTrack({
					trackId: track.trackId,
				});

				inboundAudioTrack.update(track, sample.timestamp);

				remoteInboundAudioTracks.set(
					track.sfuStreamId ?? track.ssrc,
					inboundAudioTrack
				);
			}

			for (const track of sample.inboundVideoTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`InboundVideoTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;

				const inboundVideoTrack = peerConnection.inboundVideoTracks.get(track.trackId) ?? await peerConnection.createInboundVideoTrack({
					trackId: track.trackId,
				});

				inboundVideoTrack.update(track, sample.timestamp);

				remoteInboundVideoTracks.set(
					track.sfuStreamId ?? track.ssrc,
					inboundVideoTrack
				);
			}

			for (const track of sample.outboundAudioTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`OutboundAudioTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;

				const outboundAudioTrack = peerConnection.outboundAudioTracks.get(track.trackId) ?? await peerConnection.createOutboundAudioTrack({
					trackId: track.trackId,
				});

				outboundAudioTrack.update(track, sample.timestamp);

				const remoteInboundTrack = remoteInboundAudioTracks.get(track.sfuStreamId ?? track.ssrc);

				if (remoteInboundTrack && !outboundAudioTrack.remoteInboundTracks.has(remoteInboundTrack.trackId)) {
					outboundAudioTrack.connectInboundTrack(remoteInboundTrack);
				}
			}

			for (const track of sample.outboundVideoTracks ?? []) {
				if (!track.peerConnectionId || !track.trackId) {
					logger.warn(`OutboundVideoTrack without peerConnectionId or trackId: ${JSON.stringify(track)}`);

					continue;
				}

				const peerConnection = this._peerConnections.get(track.peerConnectionId) ?? await this._createPeerConnection(track.peerConnectionId);

				if (!peerConnection) continue;

				const outboundVideoTrack = peerConnection.outboundVideoTracks.get(track.trackId) ?? await peerConnection.createOutboundVideoTrack({
					trackId: track.trackId,
				});

				outboundVideoTrack.update(track, sample.timestamp);

				const remoteInboundTrack = remoteInboundVideoTracks.get(track.sfuStreamId ?? track.ssrc);

				if (remoteInboundTrack && !outboundVideoTrack.remoteInboundTracks.has(remoteInboundTrack.trackId)) {
					outboundVideoTrack.connectInboundTrack(remoteInboundTrack);
				}
			}

			this.emit('update');
			if (changeIceCandidatePair) {
				this.emit('candidate-pair-change');
			}

		}).finally(() => {
			--this._processingSample;
		});
	}

	private async _createPeerConnection(peerConnectionId: string): Promise<ObservedPeerConnection> {
		const result = await ObservedPeerConnection.create({
			peerConnectionId,
		}, this, this._storageProvider);

		result.once('close', () => {
			this._peerConnections.delete(peerConnectionId);
			this._model.peerConnectionIds = this._model.peerConnectionIds.filter((id) => id !== peerConnectionId);
			this._save().catch(() => void 0);
		});
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
}