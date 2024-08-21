import { Browser, ClientSample, Engine, IceLocalCandidate, IceRemoteCandidate, MediaCodecStats, MediaDevice, OperationSystem, Platform } from '@observertc/sample-schemas-js';
import { ObservedCall } from './ObservedCall';
import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { createLogger } from './common/logger';
import { CallMetaType, createCallMetaReport } from './common/CallMetaReports';
// eslint-disable-next-line camelcase
import { PartialBy, isValidUuid } from './common/utils';
import { CallEventType } from './common/CallEventType';
import { ObservedSfu } from './ObservedSfu';
import { ClientIssue } from './monitors/CallSummary';
import { CallEventReport } from '@observertc/report-schemas-js';
import { CalculatedScore } from './common/CalculatedScore';

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
	coordinates?: {
		latitude: number;
		longitude: number;
	},
};

export type ObservedClientEvents = {
	update: [{
		sample: ClientSample,
		elapsedTimeInMs: number,
	}],
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
	issue: [ClientIssue],
	usingturn: [boolean],
	usermediaerror: [string],
	rejoined: [{
		lastJoined: number,
	}],
	score: [CalculatedScore],
};

export declare interface ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> {
	on<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	off<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	once<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	emit<U extends keyof ObservedClientEvents>(event: U, ...args: ObservedClientEvents[U]): boolean;
	readonly appData: AppData;
}

type PendingPeerConnectionTimestamp = {
	type: 'opened' | 'closed'
	peerConnectionId: string;
	timestamp: number;
}

type PendingMediaTrackTimestamp = {
	type: 'added' | 'removed'
	peerConnectionId: string;
	mediaTrackId: string;
	timestamp: number;
}

export class ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	
	public readonly created = Date.now();
	public _updated = Date.now();
	public sfuId?: string;
	
	private readonly _peerConnections = new Map<string, ObservedPeerConnection>();
	
	private _closed = false;
	
	private _acceptedSamples = 0;
	private _timeZoneOffsetInHours?: number;

	// the timestamp of the CLIENT_JOINED event
	public joined?: number;
	public left?: number;
	
	public score?: CalculatedScore;
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
	public totalReceivedAudioBytes = 0;
	public totalReceivedVideoBytes = 0;
	public totalSentAudioBytes = 0;
	public totalSentVideoBytes = 0;

	public deltaReceivedAudioBytes = 0;
	public deltaReceivedVideoBytes = 0;
	public deltaSentAudioBytes = 0;
	public deltaSentVideoBytes = 0;
	public deltaDataChannelBytesSent = 0;
	public deltaDataChannelBytesReceived = 0;
	public deltaInboundPacketsLost = 0;
	public deltaInboundPacketsReceived = 0;
	public deltaOutboundPacketsSent = 0;

	public avgRttInMs?: number;
	public outboundAudioBitrate?: number;
	public outboundVideoBitrate?: number;
	public inboundAudioBitrate?: number;
	public inboundVideoBitrate?: number;
	public mediaConstraints: string[] = [];

	public readonly mediaDevices: MediaDevice[] = [];
	public readonly mediaCodecs: MediaCodecStats[] = [];
	public readonly userMediaErrors: string[] = [];
	public readonly issues: ClientIssue[] = [];

	public ωpendingPeerConnectionTimestamps: PendingPeerConnectionTimestamp[] = [];
	public ωpendingMediaTrackTimestamps: PendingMediaTrackTimestamp[] = [];
	
	public constructor(
		private readonly _model: ObservedClientModel,
		public readonly call: ObservedCall,
		public readonly appData: AppData
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public getSfu<T extends Record<string, unknown> = Record<string, unknown>>(): ObservedSfu<T> | undefined {
		const sfu = this.call.observer.observedSfus.get(this.sfuId ?? '');

		if (!sfu) return;
		
		return sfu as ObservedSfu<T>;
	}

	public get sfu(): ObservedSfu | undefined {
		if (!this.sfuId) return;
		
		return this.call.observer.observedSfus.get(this.sfuId);
	}

	public get coordinates() {
		return this._model.coordinates;
	}

	public set coordinates(value: { latitude: number; longitude: number } | undefined) {
		this._model.coordinates = value;
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

	public set userId(userId: string | undefined) {
		this._model.userId = userId;
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

	public get acceptedSamples() {
		return this._acceptedSamples;
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

		Array.from(this._peerConnections.values()).forEach((peerConnection) => peerConnection.close());

		this.emit('close');
	}

	public addEventReport(params: PartialBy<Omit<CallEventReport, 'serviceId' | 'roomId' | 'callId' | 'clientId' | 'userId' | 'marker' | 'attachments'>, 'timestamp'> & { attachments?: Record<string, unknown> }) {
		const {
			attachments,
			...fields
		} = params;

		this.reports.addCallEventReport({
			...fields,
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			roomId: this.roomId,
			callId: this.callId,
			clientId: this.clientId,
			userId: this.userId,
			timestamp: params.timestamp ?? Date.now(),
			marker: this.marker,
			attachments: attachments ? JSON.stringify(attachments) : undefined,
		});
	}

	public addExtensionStatsReport(extensionType: string, payload?: Record<string, unknown>) {
		this.reports.addClientExtensionReport({
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			roomId: this.roomId,
			callId: this.callId,
			clientId: this.clientId,
			userId: this.userId,
			timestamp: Date.now(),
			extensionType,
			payload: JSON.stringify(payload),
			marker: this.marker,
		});
	}

	public addIssue(issue: ClientIssue) {
		try {
			
			this.reports.addCallEventReport({
				serviceId: this.serviceId,
				mediaUnitId: this.mediaUnitId,
				roomId: this.roomId,
				callId: this.callId,
				clientId: this.clientId,
				userId: this.userId,
				
				name: CallEventType.CLIENT_ISSUE,
				value: issue.severity,
				peerConnectionId: issue.peerConnectionId,
				mediaTrackId: issue.trackId,
				message: issue.description,
				timestamp: issue.timestamp ?? Date.now(),
				attachments: issue.attachments ? JSON.stringify(issue.attachments): undefined,
			});
		} catch (err) {
			logger.warn(`Error adding client issue: ${(err as Error)?.message}`);
		}

		this._addAndEmitIssue(issue);
	}

	public accept(sample: ClientSample): void {
		if (this._closed) throw new Error(`Client ${this.clientId} is closed`);
		if (sample.clientId && sample.clientId !== 'NULL' && sample.clientId !== this.clientId) {
			throw new Error(`Sample client id (${sample.clientId}) does not match the client id of the observed client (${this.clientId})`);
		}
		const now = Date.now();

		++this._acceptedSamples;
		
		for (const peerConnection of this._peerConnections.values()) {
			if (peerConnection.closed) continue;
			peerConnection.resetMetrics();
		}

		if (this._model.userId) {
			if (sample.userId && sample.userId !== 'NULL' && sample.userId !== this._model.userId) {
				this._model.userId = sample.userId;
			}
		} else if (sample.userId && sample.userId !== 'NULL') {
			this._model.userId = sample.userId;
		}
		
		if (this._model.marker !== sample.marker) {
			this._model.marker = sample.marker;
			this._peerConnections.forEach((peerConnection) => (peerConnection.marker = sample.marker));
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
				}, 
				this.userId,
				undefined,
				sample.timestamp
			);
	
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
				}, 
				this.userId,
				undefined,
				sample.timestamp
			);
	
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
				},
				this.userId,
				undefined,
				sample.timestamp
			);
	
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
				}, 
				this.userId,
				undefined,
				sample.timestamp
			);
	
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
				}, 
				this.userId,
				undefined,
				sample.timestamp
			);

			this.reports.addCallMetaReport(callMetaReport);
			this.mediaConstraints.push(mediaConstraint);
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
				}, 
				this.userId,
				undefined,
				sample.timestamp
			);

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
				timestamp: now,
				payload: extensionStats.payload,
				extensionType: extensionStats.type,
			});
		}

		for (const { timestamp, ...callEvent } of sample.customCallEvents ?? []) {
			switch (callEvent.name) {
				case CallEventType.CLIENT_JOINED: {
					const lastJoined = this.joined;

					this.joined = timestamp;

					// if it is joined before and it is joined again
					if (lastJoined && this.joined && lastJoined !== this.joined) {
						this.emit('rejoined', { lastJoined });
					}
					// in case we have a left event before the joined event
					if (this.left && this.joined && this.left < this.joined) {
						this.left = undefined;
					}
					break;
				}
				case CallEventType.CLIENT_LEFT: {
					this.left = timestamp;
					break;
				}
				case CallEventType.PEER_CONNECTION_OPENED: {
					callEvent.peerConnectionId && this.ωpendingPeerConnectionTimestamps.push({
						type: 'opened',
						peerConnectionId: callEvent.peerConnectionId,
						timestamp: timestamp ?? sample.timestamp,
					});
					break;
				}
				case CallEventType.PEER_CONNECTION_CLOSED: {
					callEvent.peerConnectionId && this.ωpendingPeerConnectionTimestamps.push({
						type: 'closed',
						peerConnectionId: callEvent.peerConnectionId,
						timestamp: timestamp ?? sample.timestamp,
					});
					break;
				}
				case CallEventType.MEDIA_TRACK_ADDED: {
					callEvent.peerConnectionId && callEvent.mediaTrackId && this.ωpendingMediaTrackTimestamps.push({
						type: 'added',
						peerConnectionId: callEvent.peerConnectionId,
						mediaTrackId: callEvent.mediaTrackId,
						timestamp: timestamp ?? sample.timestamp,
					});
					break;
				}
				case CallEventType.MEDIA_TRACK_REMOVED: {
					callEvent.peerConnectionId && callEvent.mediaTrackId && this.ωpendingMediaTrackTimestamps.push({
						type: 'removed',
						peerConnectionId: callEvent.peerConnectionId,
						mediaTrackId: callEvent.mediaTrackId,
						timestamp: timestamp ?? sample.timestamp,
					});
					break;
				}
				case CallEventType.CLIENT_ISSUE: {
					const severity = callEvent.value ? callEvent.value as ClientIssue['severity'] : 'minor';

					try {
						const issue: ClientIssue = {
							severity,
							timestamp: timestamp ?? Date.now(),
							description: callEvent.message,
							peerConnectionId: callEvent.peerConnectionId,
							trackId: callEvent.mediaTrackId,
							attachments: callEvent.attachments ? JSON.parse(callEvent.attachments) : undefined,
						};

						this._addAndEmitIssue(issue);
					} catch (err) {
						logger.warn(`Error parsing client issue: ${(err as Error)?.message}`);
					}
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
				timestamp: timestamp ?? now,
				...callEvent,
			});

			this.call.emit('callevent', {
				mediaUnitId: this.mediaUnitId,
				clientId: this.clientId,
				userId: this.userId,
				timestamp: timestamp ?? now,
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
				}, 
				this.userId,
			);

			this.reports.addCallMetaReport(callMetaReport);
			this.userMediaErrors.push(userMediaError);
			this.emit('usermediaerror', userMediaError);
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
				}, 
				this.userId
			);

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
			if (codec.mimeType && !this.mediaCodecs.find((c) => c.mimeType === codec.mimeType)) {
				this.mediaCodecs.push(codec);
			}
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
			if (mediaDevice.id && !this.mediaDevices.find((d) => d.id === mediaDevice.id)) {
				this.mediaDevices.push(mediaDevice);
			}
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
	
				if (!inboundAudioTrack.remoteOutboundTrack) {
					const remoteOutboundTrack = this.call.sfuStreamIdToOutboundAudioTrack.get(inboundAudioTrack.sfuStreamId ?? '');

					if (remoteOutboundTrack) {
						inboundAudioTrack.remoteOutboundTrack = remoteOutboundTrack;
						
						inboundAudioTrack.once('close', () => {
							remoteOutboundTrack?.remoteInboundTracks.delete(inboundAudioTrack.trackId ?? '');
						});
						remoteOutboundTrack.remoteInboundTracks.set(inboundAudioTrack.trackId ?? '', inboundAudioTrack);
					}
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

				if (!inboundVideoTrack.remoteOutboundTrack) {
					const remoteOutboundTrack = this.call.sfuStreamIdToOutboundVideoTrack.get(inboundVideoTrack.sfuStreamId ?? '');

					if (remoteOutboundTrack) {
						inboundVideoTrack.remoteOutboundTrack = remoteOutboundTrack;
						
						inboundVideoTrack.once('close', () => {
							remoteOutboundTrack?.remoteInboundTracks.delete(inboundVideoTrack.trackId ?? '');
						});
						remoteOutboundTrack.remoteInboundTracks.set(inboundVideoTrack.trackId ?? '', inboundVideoTrack);
					}
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

				if (outboundAudioTrack.sfuStreamId && !this.call.sfuStreamIdToOutboundAudioTrack.has(outboundAudioTrack.sfuStreamId)) {
					this.call.sfuStreamIdToOutboundAudioTrack.set(outboundAudioTrack.sfuStreamId, outboundAudioTrack);
				}

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

				if (outboundVideoTrack.sfuStreamId && !this.call.sfuStreamIdToOutboundVideoTrack.has(outboundVideoTrack.sfuStreamId)) {
					this.call.sfuStreamIdToOutboundVideoTrack.set(outboundVideoTrack.sfuStreamId, outboundVideoTrack);
				}

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

			peerConnection.ICE.addLocalCandidate(iceLocalCandidate, sample.timestamp);
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

			peerConnection.ICE.addRemoteCandidate(iceRemoteCandidate, sample.timestamp);
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

		// try to set the timestamps of the peer connections
		if (0 < this.ωpendingPeerConnectionTimestamps.length) {
			const newPendingTimestamps: PendingPeerConnectionTimestamp[] = [];

			for (const pendingTimestamp of this.ωpendingPeerConnectionTimestamps) {
				const peerConnection = this._peerConnections.get(pendingTimestamp.peerConnectionId);

				if (!peerConnection) {
					newPendingTimestamps.push(pendingTimestamp);
					continue;
				}
				if (pendingTimestamp.type === 'opened') peerConnection.opened = pendingTimestamp.timestamp;
				else if (pendingTimestamp.type === 'closed') peerConnection.closedTimestamp = pendingTimestamp.timestamp;
			}

			this.ωpendingPeerConnectionTimestamps = newPendingTimestamps;
		}
		
		// try to set the timestamps of the media tracks
		if (0 < this.ωpendingMediaTrackTimestamps.length) {
			const newPendingTimestamps: PendingMediaTrackTimestamp[] = [];

			for (const pendingTimestamp of this.ωpendingMediaTrackTimestamps) {
				const peerConnection = this._peerConnections.get(pendingTimestamp.peerConnectionId);
				const mediaTrack = peerConnection?.inboundAudioTracks.get(pendingTimestamp.mediaTrackId) ??
					peerConnection?.inboundVideoTracks.get(pendingTimestamp.mediaTrackId) ??
					peerConnection?.outboundAudioTracks.get(pendingTimestamp.mediaTrackId) ??
					peerConnection?.outboundVideoTracks.get(pendingTimestamp.mediaTrackId);

				if (!mediaTrack) {
					newPendingTimestamps.push(pendingTimestamp);
					continue;
				}

				if (pendingTimestamp.type === 'added') mediaTrack.added = pendingTimestamp.timestamp;
				else if (pendingTimestamp.type === 'removed') mediaTrack.removed = pendingTimestamp.timestamp;
			}

			this.ωpendingMediaTrackTimestamps = newPendingTimestamps;
		}

		// close resources that are not visited
		for (const peerConnection of this._peerConnections.values()) {
			if (!peerConnection.visited) {
				peerConnection.close();

				continue;
			}

			for (const track of peerConnection.inboundAudioTracks.values()) {
				if (!track.visited) {
					track.close();

					continue;
				}

				track.visited = false;
			}
			for (const track of peerConnection.inboundVideoTracks.values()) {
				if (!track.visited) {
					track.close();

					continue;
				}

				track.visited = false;
			}
			for (const track of peerConnection.outboundAudioTracks.values()) {
				if (!track.visited) {
					track.close();

					continue;
				}

				track.visited = false;
			}
			for (const dataChannel of peerConnection.dataChannels.values()) {
				if (!dataChannel.visited) {
					dataChannel.close();

					continue;
				}

				dataChannel.visited = false;
			}

			peerConnection.visited = false;
		}

		// update metrics
		const wasUsingTURN = this.usingTURN;
		const elapsedTimeInMs = now - this._updated;

		this.usingTURN = false;
		this.availableIncomingBitrate = 0;
		this.availableOutgoingBitrate = 0;
		this.deltaInboundPacketsLost = 0;
		this.deltaInboundPacketsReceived = 0;
		this.deltaOutboundPacketsSent = 0;
		this.deltaReceivedAudioBytes = 0;
		this.deltaReceivedVideoBytes = 0;
		this.deltaSentAudioBytes = 0;
		this.deltaSentVideoBytes = 0;
		this.deltaDataChannelBytesReceived = 0;
		this.deltaDataChannelBytesSent = 0;
		
		this.outboundAudioBitrate = 0;
		this.outboundVideoBitrate = 0;
		this.inboundAudioBitrate = 0;
		this.inboundVideoBitrate = 0;
		let sumRttInMs = 0;
		let anyPeerConnectionUsingTurn = false;

		let minPcScore = Number.MAX_SAFE_INTEGER;
		let maxPcScore = Number.MIN_SAFE_INTEGER;

		for (const peerConnection of this._peerConnections.values()) {
			if (peerConnection.closed) continue;
			peerConnection.updateMetrics();
			this.deltaInboundPacketsLost += peerConnection.deltaInboundPacketsLost;
			this.deltaInboundPacketsReceived += peerConnection.deltaInboundPacketsReceived;
			this.deltaOutboundPacketsSent += peerConnection.deltaOutboundPacketsSent;
			this.deltaReceivedAudioBytes += peerConnection.deltaReceivedAudioBytes;
			this.deltaReceivedVideoBytes += peerConnection.deltaReceivedVideoBytes;
			this.deltaSentAudioBytes += peerConnection.deltaSentAudioBytes;
			this.deltaSentVideoBytes += peerConnection.deltaSentVideoBytes;
			this.deltaDataChannelBytesReceived += peerConnection.deltaDataChannelBytesReceived;
			this.deltaDataChannelBytesSent += peerConnection.deltaDataChannelBytesSent;

			this.availableIncomingBitrate += peerConnection.availableIncomingBitrate ?? 0;
			this.availableOutgoingBitrate += peerConnection.availableOutgoingBitrate ?? 0;

			sumRttInMs += peerConnection.avgRttInMs ?? 0;

			anyPeerConnectionUsingTurn ||= peerConnection.usingTURN;

			minPcScore = Math.min(minPcScore, peerConnection.score?.score ?? Number.MAX_SAFE_INTEGER);
			maxPcScore = Math.max(maxPcScore, peerConnection.score?.score ?? Number.MIN_SAFE_INTEGER);
		}

		this.score = {
			score: minPcScore,
			remarks: [ {
				severity: 'none',
				text: `Min and max score of all peer connections: ${minPcScore}, ${maxPcScore}`,
			} ],
			timestamp: sample.timestamp,
		};
		this.emit('score', this.score);

		this.usingTURN = anyPeerConnectionUsingTurn === true;
		
		if (wasUsingTURN !== this.usingTURN) this.emit('usingturn', this.usingTURN);

		this.totalSentBytes += this.deltaSentAudioBytes + this.deltaSentVideoBytes;
		this.totalReceivedBytes += this.deltaReceivedAudioBytes + this.deltaReceivedVideoBytes;
		this.totalReceivedAudioBytes += this.deltaReceivedAudioBytes;
		this.totalReceivedVideoBytes += this.deltaReceivedVideoBytes;	
		this.totalSentAudioBytes += this.deltaSentAudioBytes;
		this.totalSentVideoBytes += this.deltaSentVideoBytes;
		this.totalOutboundPacketsSent += this.deltaOutboundPacketsSent;
		this.totalInboundPacketsReceived += this.deltaInboundPacketsReceived;
		this.totalInboundPacketsLost += this.deltaInboundPacketsLost;
		this.totalDataChannelBytesSent += this.deltaDataChannelBytesSent;
		this.totalDataChannelBytesReceived += this.deltaDataChannelBytesReceived;
		
		this.outboundAudioBitrate = (this.deltaSentAudioBytes * 8) / (Math.max(elapsedTimeInMs, 1) / 1000);
		this.outboundVideoBitrate = (this.deltaSentVideoBytes * 8) / (Math.max(elapsedTimeInMs, 1) / 1000);
		this.inboundAudioBitrate = (this.deltaReceivedAudioBytes * 8) / (Math.max(elapsedTimeInMs, 1) / 1000);
		this.inboundVideoBitrate = (this.deltaReceivedVideoBytes * 8) / (Math.max(elapsedTimeInMs, 1) / 1000);

		this.avgRttInMs = this._peerConnections.size ? sumRttInMs / this._peerConnections.size : undefined;
		
		// to make sure when sample is emitted it can be associated to this client
		sample.clientId = this.clientId;

		this._updated = now;
		this.emit('update', {
			sample,
			elapsedTimeInMs,
		});
	}

	private _addAndEmitIssue(issue: ClientIssue) {
		this.issues.push(issue);

		if (issue.peerConnectionId) {
			const peerConnection = this._peerConnections.get(issue.peerConnectionId);

			if (peerConnection) {
				
				if (issue.trackId) {
					const track = peerConnection.inboundAudioTracks.get(issue.trackId) ?? peerConnection.inboundVideoTracks.get(issue.trackId);

					if (track) track.ωpendingIssuesForScores.push(issue);
				} else {
					peerConnection.ωpendingIssuesForScores.push(issue);
				}
			}
		}

		this.emit('issue', issue);
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
}