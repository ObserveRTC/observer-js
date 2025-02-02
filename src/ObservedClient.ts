import { EventEmitter } from 'events';
import { ObservedPeerConnection } from './ObservedPeerConnection';
import { createLogger } from './common/logger';
// eslint-disable-next-line camelcase
import { ClientEvent, ClientMetaData, ClientSample, PeerConnectionSample, ClientIssue, ExtensionStat } from './schema/ClientSample';
import * as MetaData from './schema/ClientMetaTypes';
import { ClientEventTypes } from './schema/ClientEventTypes';
import { ObservedCall } from './ObservedCall';
import { ClientMetaTypes } from './schema/ClientMetaTypes';
import { parseJsonAs } from './common/utils';
import { CalculatedScore } from './scores/CalculatedScore';
import { Detectors } from './detectors/Detectors';

const logger = createLogger('ObservedClient');

export type ObservedClientSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	clientId: string;
	appData?: AppData;
};

export type ObservedClientEvents = {
	update: [
		{
			sample: ClientSample;
			elapsedTimeInMs: number;
		}
	];
	close: [];
	joined: [];
	issue: [ClientIssue];
	metaData: [ClientMetaData];
	rejoined: [timestamp: number];
	left: [];
	usingturn: [boolean];
	usermediaerror: [string];

	// do we need this?
	newpeerconnection: [ObservedPeerConnection];
};

export declare interface ObservedClient {
	on<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	off<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	once<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	emit<U extends keyof ObservedClientEvents>(event: U, ...args: ObservedClientEvents[U]): boolean;
}

export class ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly detectors: Detectors;

	public readonly clientId: string;
	public readonly observedPeerConnections = new Map<string, ObservedPeerConnection>();
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};

	public appData?: AppData;
	public attachments?: Record<string, unknown>;

	public updated = Date.now();
	public acceptedSamples = 0;
	public closed = false;

	public joinedAt?: number;
	public leftAt?: number;
	// the timestamp of the CLIENT_JOINED event
	public operationSystem?: MetaData.OperationSystem;
	public engine?: MetaData.Engine;
	public platform?: MetaData.Platform;
	public browser?: MetaData.Browser;
	public mediaConstraints: string[] = [];

	public usingTURN = false;
	public availableOutgoingBitrate = 0;
	public availableIncomingBitrate = 0;
	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;
	public totalDataChannelMessagesSent = 0;
	public totalDataChannelMessagesReceived = 0;
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
	public deltaDataChannelMessagesSent = 0;
	public deltaDataChannelMessagesReceived = 0;
	public deltaInboundPacketsLost = 0;
	public deltaInboundPacketsReceived = 0;
	public deltaOutboundPacketsSent = 0;

	public avgRttInMs?: number;
	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;

	public numberOfInboundRtpStreams = 0;
	public numberOfInbundTracks = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfOutboundTracks = 0;
	public numberOfDataChannels = 0;

	public readonly mediaDevices: MetaData.MediaDeviceInfo[] = [];
	public issues: ClientIssue[] = [];

	public constructor(settings: ObservedClientSettings<AppData>, public readonly call: ObservedCall) {
		super();
		this.setMaxListeners(Infinity);

		this.clientId = settings.clientId;
		this.appData = settings.appData;
		this.detectors = new Detectors();
	}

	public get numberOfPeerConnections() {
		return this.observedPeerConnections.size;
	}

	public get score() { 
		return this.calculatedScore.value; 
	}

	public close() {
		if (this.closed) return;
		this.closed = true;

		Array.from(this.observedPeerConnections.values()).forEach((peerConnection) => peerConnection.close());

		this.emit('close');
	}

	public accept(sample: ClientSample): void {
		if (this.closed) throw new Error(`Client ${this.clientId} is closed`);

		const now = Date.now();
		const elapsedInMs = now - this.updated;
		const elapsedInSeconds = elapsedInMs / 1000;

		++this.acceptedSamples;
		
		this.availableIncomingBitrate = 0;
		this.availableOutgoingBitrate = 0;
		this.deltaDataChannelBytesReceived = 0;
		this.deltaDataChannelBytesSent = 0;
		this.deltaDataChannelMessagesReceived = 0;
		this.deltaDataChannelMessagesSent = 0;
		this.deltaInboundPacketsLost = 0;
		this.deltaInboundPacketsReceived = 0;
		this.deltaOutboundPacketsSent = 0;
		this.deltaReceivedAudioBytes = 0;
		this.deltaReceivedVideoBytes = 0;
		this.deltaSentAudioBytes = 0;
		this.deltaSentVideoBytes = 0;

		this.numberOfDataChannels = 0;
		this.numberOfInboundRtpStreams = 0;
		this.numberOfInbundTracks = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfOutboundTracks = 0;

		sample.clientEvents?.forEach(this._processClientEvent.bind(this));
		sample.clientMetaItems?.forEach(this.processMetadata.bind(this));
		sample.clientIssues?.forEach(this.addIssue.bind(this));
		sample.peerConnections?.forEach(this._updatePeerConnection.bind(this));
		sample.extensionStats?.forEach(this.addExtensionStats.bind(this));

		// emit new attachments?
		this.attachments = sample.attachments;

		this.totalDataChannelBytesReceived += this.deltaDataChannelBytesReceived;
		this.totalDataChannelBytesSent += this.deltaDataChannelBytesSent;
		this.totalDataChannelMessagesReceived += this.deltaDataChannelMessagesReceived;
		this.totalDataChannelMessagesSent += this.deltaDataChannelMessagesSent;
		this.totalInboundPacketsLost += this.deltaInboundPacketsLost;
		this.totalInboundPacketsReceived += this.deltaInboundPacketsReceived;
		this.totalOutboundPacketsSent += this.deltaOutboundPacketsSent;
		this.totalReceivedAudioBytes += this.deltaReceivedAudioBytes;
		this.totalReceivedVideoBytes += this.deltaReceivedVideoBytes;
		this.totalSentAudioBytes += this.deltaSentAudioBytes;
		this.totalSentVideoBytes += this.deltaSentVideoBytes;

		this.receivingAudioBitrate = (this.deltaReceivedAudioBytes * 8) / (elapsedInSeconds);
		this.receivingVideoBitrate = (this.totalReceivedVideoBytes * 8) / (elapsedInSeconds);
		this.sendingAudioBitrate = (this.deltaSentAudioBytes * 8) / (elapsedInSeconds);
		this.sendingVideoBitrate = (this.deltaSentVideoBytes * 8) / (elapsedInSeconds);

		this.calculatedScore.value = sample.score;
		this.detectors.update();

		// emit update
		this.emit('update', {
			sample,
			elapsedTimeInMs: now - this.updated,
		});
		this.updated = now;
	}

	private _processClientEvent(event: ClientEvent) {
		switch (event.type) {
			case ClientEventTypes.CALL_STARTED: {
				// update call timestamp if it's the first time
				break;
			}
			case ClientEventTypes.CALL_ENDED: {
				// update call timestamp if it's the first time
				break;
			}
			case ClientEventTypes.CLIENT_JOINED: {
				if (event.timestamp) {
					if (!this.joinedAt) {
						this.joinedAt = event.timestamp;
						this.emit('joined');
					} else if (this.joinedAt < event.timestamp) {
						this.emit('rejoined', event.timestamp);
					} else {
						this.joinedAt = event.timestamp;
						logger.warn(`Client ${this.clientId} joinedAt timestamp was updated to ${event.timestamp}. the joined event will not be emitted.`);
					}
				}
				break;
			}
			case ClientEventTypes.CLIENT_LEFT: {
				if (event.timestamp) {
					if (!this.leftAt) {
						this.leftAt = event.timestamp;
						this.emit('left');
					}
				}
				break;
			}
		}

		this.call.observer.emit('client-event', this, event);
	}

	public processMetadata(metadata: ClientMetaData) {
		switch (metadata.type) {
			case ClientMetaTypes.BROWSER: {
				this.browser = parseJsonAs(metadata.payload);
				break;
			}
			case ClientMetaTypes.ENGINE: {
				this.engine = parseJsonAs(metadata.payload);
				break;
			}
			case ClientMetaTypes.PLATFORM: {
				this.platform = parseJsonAs(metadata.payload);
				break;
			}
			case ClientMetaTypes.OPERATION_SYSTEM: {
				this.operationSystem = parseJsonAs(metadata.payload);
				break;
			}
		}

		this.call.observer.emit('client-metadata', this, metadata);
	}

	public addIssue(issue: ClientIssue) {
		this.emit('issue', issue);
		this.call.observer.emit('client-issue', this, issue);
	}

	public addExtensionStats(stats: ExtensionStat) {
		this.call.observer.emit('client-extension-stats', this, stats);
	}

	private _updatePeerConnection(sample: PeerConnectionSample) {
		let observedPeerConnection = this.observedPeerConnections.get(sample.peerConnectionId);

		if (!observedPeerConnection) {
			if (!sample.peerConnectionId) {
				return logger.warn(
					`ObservedClient received an invalid PeerConnectionSample (missing peerConnectionId field). ClientId: ${this.clientId}, CallId: ${this.call.callId}`,
					sample
				);
			}

			observedPeerConnection = new ObservedPeerConnection(sample.peerConnectionId, this);

			observedPeerConnection.once('close', () => {
				this.observedPeerConnections.delete(sample.peerConnectionId);
			});
			this.observedPeerConnections.set(sample.peerConnectionId, observedPeerConnection);
			
			this.emit('newpeerconnection', observedPeerConnection);
		}

		observedPeerConnection.accept(sample);

		this.deltaDataChannelBytesReceived += observedPeerConnection.deltaDataChannelBytesReceived;
		this.deltaDataChannelBytesSent += observedPeerConnection.deltaDataChannelBytesSent;
		this.deltaDataChannelMessagesReceived += observedPeerConnection.deltaDataChannelMessagesReceived;
		this.deltaDataChannelMessagesSent += observedPeerConnection.deltaDataChannelMessagesSent;
		this.deltaInboundPacketsLost += observedPeerConnection.deltaInboundPacketsLost;
		this.deltaInboundPacketsReceived += observedPeerConnection.deltaInboundPacketsReceived;
		this.deltaOutboundPacketsSent += observedPeerConnection.deltaOutboundPacketsSent;
		this.deltaReceivedAudioBytes += observedPeerConnection.deltaReceivedAudioBytes;
		this.deltaReceivedVideoBytes += observedPeerConnection.deltaReceivedVideoBytes;
		this.deltaSentAudioBytes += observedPeerConnection.deltaSentAudioBytes;
		this.deltaSentVideoBytes += observedPeerConnection.deltaSentVideoBytes;

		this.availableIncomingBitrate += observedPeerConnection.availableIncomingBitrate;
		this.availableOutgoingBitrate += observedPeerConnection.availableOutgoingBitrate;

		this.numberOfDataChannels += observedPeerConnection.observedDataChannels.size;
		this.numberOfInbundTracks += observedPeerConnection.observedInboundTracks.size;
		this.numberOfOutboundRtpStreams += observedPeerConnection.observedOutboundRtps.size;
		this.numberOfOutboundTracks += observedPeerConnection.observedOutboundTracks.size;
		this.numberOfInboundRtpStreams += observedPeerConnection.observedInboundRtps.size;
	}
}
