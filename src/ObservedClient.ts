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

	public appData: AppData;
	public attachments?: Record<string, unknown>;

	public updated = Date.now();
	public acceptedSamples = 0;
	public closed = false;

	public joinedAt?: number;
	public leftAt?: number;
	public closedAt?: number;
	// the timestamp of the CLIENT_JOINED event
	public operationSystem?: MetaData.OperationSystem;
	public engine?: MetaData.Engine;
	public platform?: MetaData.Platform;
	public browser?: MetaData.Browser;
	public mediaConstraints: string[] = [];

	public usingTURN = false;
	public usingTCP = false;
	public availableOutgoingBitrate = 0;
	public availableIncomingBitrate = 0;

	public totalInboundPacketsLost = 0;
	public totalInboundPacketsReceived = 0;
	public totalOutboundPacketsSent = 0;
	public totalDataChannelBytesSent = 0;
	public totalDataChannelBytesReceived = 0;
	public totalDataChannelMessagesSent = 0;
	public totalDataChannelMessagesReceived = 0;
	public totalReceivedAudioBytes = 0;
	public totalReceivedVideoBytes = 0;
	public totalSentAudioBytes = 0;
	public totalSentVideoBytes = 0;
	public totalSentBytes = 0;
	public totalReceivedBytes = 0;

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
	public deltaTransportSentBytes = 0;
	public deltaTransportReceivedBytes = 0;
	public deltaRttLt50Measurements = 0;
	public deltaRttLt150Measurements = 0;
	public deltaRttLt300Measurements = 0;
	public deltaRttGtOrEq300Measurements = 0;

	public currentMaxRttInMs?: number;
	public currentMinRttInMs?: number;
	public currentAvgRttInMs?: number;

	public sendingAudioBitrate = 0;
	public sendingVideoBitrate = 0;
	public receivingAudioBitrate = 0;
	public receivingVideoBitrate = 0;

	public numberOfInboundRtpStreams = 0;
	public numberOfInbundTracks = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfOutboundTracks = 0;
	public numberOfDataChannels = 0;

	public totalRttLt50Measurements = 0;
	public totalRttLt150Measurements = 0;
	public totalRttLt300Measurements = 0;
	public totalRttGtOrEq300Measurements = 0;
	public deltaNumberOfIssues = 0;

	public totalScoreSum = 0;
	public numberOfScoreMeasurements = 0;
	public totalNumberOfIssues = 0;

	public readonly mediaDevices: MetaData.MediaDeviceInfo[] = [];
	public issues: ClientIssue[] = [];

	public constructor(settings: ObservedClientSettings<AppData>, public readonly call: ObservedCall) {
		super();
		this.setMaxListeners(Infinity);

		this.clientId = settings.clientId;
		this.appData = settings.appData ?? {} as AppData;
		
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

		this.closedAt = Date.now();

		this.emit('close');
	}

	public accept(sample: ClientSample): void {
		if (this.closed) throw new Error(`Client ${this.clientId} is closed`);

		const now = Date.now();
		const elapsedInMs = now - this.updated;
		const elapsedInSeconds = elapsedInMs / 1000;
		let sumOfRtts = 0;
		let numberOfRttMeasurements = 0;
		
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
		this.deltaTransportReceivedBytes = 0;
		this.deltaTransportSentBytes = 0;
		this.deltaRttLt50Measurements = 0;
		this.deltaRttLt150Measurements = 0;
		this.deltaRttLt300Measurements = 0;
		this.deltaRttGtOrEq300Measurements = 0;
		this.deltaNumberOfIssues = 0;

		this.numberOfDataChannels = 0;
		this.numberOfInboundRtpStreams = 0;
		this.numberOfInbundTracks = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfOutboundTracks = 0;
		this.usingTURN = false;
		this.usingTCP = false;
		this.currentMinRttInMs = undefined;
		this.currentMaxRttInMs = undefined;

		const clientEventsPostBuffer: ClientEvent[] = [];

		for (const clientEvent of sample.clientEvents ?? []) {
			this._processClientEvent(clientEvent, clientEventsPostBuffer);

			this.call.observer.emit('client-event', this, clientEvent);
		}

		for (const metaData of sample.clientMetaItems ?? []) {
			this.addMetadata(metaData);
		}

		for (const issue of sample.clientIssues ?? []) {
			this.addIssue(issue);

			++this.deltaNumberOfIssues;
		}

		for (const extensionStat of sample.extensionStats ?? []) {
			this.addExtensionStats(extensionStat);
		}

		for (const pcSample of sample.peerConnections ?? []) {
			const observedPeerConnection = this._updatePeerConnection(pcSample);

			if (!observedPeerConnection) continue;

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
			this.deltaTransportReceivedBytes += observedPeerConnection.deltaTransportReceivedBytes;
			this.deltaTransportSentBytes += observedPeerConnection.deltaTransportSentBytes;
			
			this.availableIncomingBitrate += observedPeerConnection.availableIncomingBitrate;
			this.availableOutgoingBitrate += observedPeerConnection.availableOutgoingBitrate;

			this.numberOfDataChannels += observedPeerConnection.observedDataChannels.size;
			this.numberOfInbundTracks += observedPeerConnection.observedInboundTracks.size;
			this.numberOfOutboundRtpStreams += observedPeerConnection.observedOutboundRtps.size;
			this.numberOfOutboundTracks += observedPeerConnection.observedOutboundTracks.size;
			this.numberOfInboundRtpStreams += observedPeerConnection.observedInboundRtps.size;

			if (observedPeerConnection.usingTURN) {
				this.usingTURN = true;
			}
			if (observedPeerConnection.usingTCP) {
				this.usingTCP = true;
			}

			if (observedPeerConnection.currentRttInMs) {
				if (this.currentMinRttInMs === undefined || observedPeerConnection.currentRttInMs < this.currentMinRttInMs) {
					this.currentMinRttInMs = observedPeerConnection.currentRttInMs;
				}
				if (this.currentMaxRttInMs === undefined || observedPeerConnection.currentRttInMs > this.currentMaxRttInMs) {
					this.currentMaxRttInMs = observedPeerConnection.currentRttInMs;
				}
				if (observedPeerConnection.currentRttInMs < 50) {
					this.deltaRttLt50Measurements += 1;
				} else if (observedPeerConnection.currentRttInMs < 150) {
					this.deltaRttLt150Measurements += 1;
				} else if (observedPeerConnection.currentRttInMs < 300) {
					this.deltaRttLt300Measurements += 1;
				} else if (300 <= observedPeerConnection.currentRttInMs) {
					this.deltaRttGtOrEq300Measurements += 1;
				}

				sumOfRtts += observedPeerConnection.currentRttInMs;
				++numberOfRttMeasurements;
			}
		}

		for (const clientEvent of clientEventsPostBuffer) {
			this._processClientEvent(clientEvent);
		}

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
		this.totalReceivedBytes += this.deltaTransportReceivedBytes;
		this.totalSentBytes += this.deltaTransportSentBytes;
		this.totalRttLt50Measurements += this.deltaRttLt50Measurements;
		this.totalRttLt150Measurements += this.deltaRttLt150Measurements;
		this.totalRttLt300Measurements += this.deltaRttLt300Measurements;
		this.totalRttGtOrEq300Measurements += this.deltaRttGtOrEq300Measurements;
		this.totalNumberOfIssues += this.deltaNumberOfIssues;

		this.receivingAudioBitrate = (this.deltaReceivedAudioBytes * 8) / (elapsedInSeconds);
		this.receivingVideoBitrate = (this.totalReceivedVideoBytes * 8) / (elapsedInSeconds);
		this.sendingAudioBitrate = (this.deltaSentAudioBytes * 8) / (elapsedInSeconds);
		this.sendingVideoBitrate = (this.deltaSentVideoBytes * 8) / (elapsedInSeconds);
		this.currentAvgRttInMs = 0 < numberOfRttMeasurements ? sumOfRtts / numberOfRttMeasurements : undefined;

		this.calculatedScore.value = sample.score;
		this.detectors.update();

		// emit update
		this.emit('update', {
			sample,
			elapsedTimeInMs: now - this.updated,
		});
		this.updated = now;

		// if result changed after update
		if (this.calculatedScore.value) {
			this.totalScoreSum += this.calculatedScore.value;
			++this.numberOfScoreMeasurements;
		}
	}

	private _processClientEvent(event: ClientEvent, postBuffer?: ClientEvent[]) {
		// eslint-disable-next-line no-console
		// console.warn('ClientEvent', event);
		switch (event.type) {
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
					} else {
						logger.warn(`Client ${this.clientId} leftAt timestamp was already set`);
					}
				}
				break;
			}
			case ClientEventTypes.PEER_CONNECTION_OPENED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);

					if (observedPeerConnection) {
						observedPeerConnection.openedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received PEER_CONNECTION_OPENED event without a corresponding observedPeerConnection', event);
					}
					
				}
				break;
			}
			case ClientEventTypes.PEER_CONNECTION_CLOSED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);

					if (observedPeerConnection) {
						observedPeerConnection.closedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received PEER_CONNECTION_CLOSED event without a corresponding observedPeerConnection', event);
					}
				}
				break;
			}
			case ClientEventTypes.MEDIA_TRACK_ADDED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.trackId && typeof payload.trackId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedTrack = observedPeerConnection?.observedInboundTracks.get(payload.trackId) ?? observedPeerConnection?.observedOutboundTracks.get(payload.trackId);

					if (observedTrack) {
						observedTrack.addedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received MEDIA_TRACK_ADDED event without a corresponding observedPeerConnection or observedTrack', event);
					}
				}
				break;
			}
			case ClientEventTypes.MEDIA_TRACK_REMOVED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.trackId && typeof payload.trackId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedTrack = observedPeerConnection?.observedInboundTracks.get(payload.trackId) ?? observedPeerConnection?.observedOutboundTracks.get(payload.trackId);

					if (observedTrack) {
						observedTrack.removedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received MEDIA_TRACK_REMOVED event without a corresponding observedPeerConnection or observedTrack', event);
					}
				}
				break;
			}
			case ClientEventTypes.DATA_CHANNEL_OPEN: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.dataChannelId && typeof payload.dataChannelId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedDataChannel = observedPeerConnection?.observedDataChannels.get(payload.dataChannelId);

					if (observedDataChannel) {
						observedDataChannel.addedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received DATA_CHANNEL_OPENED event without a corresponding observedPeerConnection or observedDataChannel', event);
					}
				}
				break;
			}
			case ClientEventTypes.DATA_CHANNEL_CLOSED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.dataChannelId && typeof payload.dataChannelId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedDataChannel = observedPeerConnection?.observedDataChannels.get(payload.dataChannelId);

					if (observedDataChannel) {
						observedDataChannel.removedAt = event.timestamp;
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received DATA_CHANNEL_CLOSE event without a corresponding observedPeerConnection or observedDataChannel', event);
					}
				}
				break;
			}
			
		}
	}

	public addMetadata(metadata: ClientMetaData) {
		if (this.closed) return;
		
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
		if (this.closed) return;

		this.emit('issue', issue);
		this.call.observer.emit('client-issue', this, issue);
	}

	public addExtensionStats(stats: ExtensionStat) {
		this.call.observer.emit('client-extension-stats', this, stats);
	}

	private _updatePeerConnection(sample: PeerConnectionSample): ObservedPeerConnection | undefined {
		let observedPeerConnection = this.observedPeerConnections.get(sample.peerConnectionId);

		if (!observedPeerConnection) {
			if (!sample.peerConnectionId) {
				return (logger.warn(
					`ObservedClient received an invalid PeerConnectionSample (missing peerConnectionId field). ClientId: ${this.clientId}, CallId: ${this.call.callId}`,
					sample
				), void 0);
			}

			observedPeerConnection = new ObservedPeerConnection(sample.peerConnectionId, this);

			observedPeerConnection.once('close', () => {
				this.observedPeerConnections.delete(sample.peerConnectionId);
			});
			this.observedPeerConnections.set(sample.peerConnectionId, observedPeerConnection);
			
			this.emit('newpeerconnection', observedPeerConnection);
		}

		observedPeerConnection.accept(sample);

		return observedPeerConnection;
	}

	// public resetSummaryMetrics() {
	// 	this.totalDataChannelBytesReceived = 0;
	// 	this.totalDataChannelBytesSent = 0;
	// 	this.totalDataChannelMessagesReceived = 0;
	// 	this.totalDataChannelMessagesSent = 0;
	// 	this.totalInboundPacketsLost = 0;
	// 	this.totalInboundPacketsReceived = 0;
	// 	this.totalOutboundPacketsSent = 0;
	// 	this.totalReceivedAudioBytes = 0;
	// 	this.totalReceivedVideoBytes = 0;
	// 	this.totalSentAudioBytes = 0;
	// 	this.totalSentVideoBytes = 0;
	// 	this.totalSentBytes = 0;
	// 	this.totalReceivedBytes = 0;
		
	// 	this.totalNumberOfIssues = 0;
		
	// 	this.totalScoreSum = 0;
	// 	this.numberOfScoreMeasurements = 0;
	// }

	// public createSummary(): ObservedClientSummary {
	// 	return {
	// 		totalRttLt50Measurements: this.totalRttLt50Measurements,
	// 		totalRttLt150Measurements: this.totalRttLt150Measurements,
	// 		totalRttLt300Measurements: this.totalRttLt300Measurements,
	// 		totalRttGtOrEq300Measurements: this.totalRttGtOrEq300Measurements,
	// 		totalDataChannelBytesReceived: this.totalDataChannelBytesReceived,
	// 		totalDataChannelBytesSent: this.totalDataChannelBytesSent,
	// 		totalDataChannelMessagesReceived: this.totalDataChannelMessagesReceived,
	// 		totalDataChannelMessagesSent: this.totalDataChannelMessagesSent,
	// 		totalInboundPacketsLost: this.totalInboundPacketsLost,
	// 		totalInboundPacketsReceived: this.totalInboundPacketsReceived,
	// 		totalOutboundPacketsSent: this.totalOutboundPacketsSent,
	// 		totalReceivedAudioBytes: this.totalReceivedAudioBytes,
	// 		totalReceivedVideoBytes: this.totalReceivedVideoBytes,
	// 		totalSentAudioBytes: this.totalSentAudioBytes,
	// 		totalSentVideoBytes: this.totalSentVideoBytes,
	// 		totalSentBytes: this.totalSentBytes,
	// 		totalReceivedBytes: this.totalReceivedBytes,
			
	// 		numberOfIssues: this.totalNumberOfIssues,

	// 		totalScoreSum: this.totalScoreSum,
	// 		numberOfScoreMeasurements: this.numberOfScoreMeasurements,
	// 	};
	// }
}
