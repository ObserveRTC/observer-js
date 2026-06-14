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
import type { AcceptContext } from './Observer';
import type { ObserverEvents, ObservedClientScope } from './ObserverEvents';
import type { ClientSampleSink } from './sinks/ClientSampleSink';

const logger = createLogger('ObservedClient');

export type ObservedClientSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	clientId: string;
	appData?: AppData;
	closeClientIfIdleForMs?: number;
};

// Local lifecycle/coordination events only. Everything worth subscribing to is
// emitted on the Observer bus (see ObserverEvents). These remain local so the
// parent ObservedCall and the updaters can wire to them for teardown/aggregation.
export type ObservedClientEvents = {
	update: [sample: ClientSample, elapsedTimeInMs: number, context?: AcceptContext];
	close: [];
	joined: [];
	left: [];
};

export declare interface ObservedClient {
	on<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	off<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	once<U extends keyof ObservedClientEvents>(event: U, listener: (...args: ObservedClientEvents[U]) => void): this;
	emit<U extends keyof ObservedClientEvents>(event: U, ...args: ObservedClientEvents[U]): boolean;
}

export class ObservedClient<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly clientId: string;
	public readonly observedPeerConnections = new Map<string, ObservedPeerConnection>();

	/** Per-client sink (from `ObserverConfig.createClientSink`), if any. */
	public readonly sink?: ClientSampleSink;

	/** Ancestry base shared by all Observer-bus events originating at this client. */
	public readonly eventScope: ObservedClientScope;
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};

	public readonly settings: Pick<ObservedClientSettings, 'closeClientIfIdleForMs'>;

	public appData: AppData;
	public attachments?: Record<string, unknown>;

	public updated = Date.now();
	public acceptedSamples = 0;
	public closed = false;

	public joinedAt?: number;
	public leftAt?: number;
	public closedAt?: number;
	public lastSampleTimestamp?: number;
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

	public deltaNumberOfIssues = 0;

	public totalScoreSum = 0;
	public numberOfScoreMeasurements = 0;
	// public totalNumberOfIssues = 0;

	public readonly mediaDevices: MetaData.MediaDeviceInfo[] = [];
	public issues: ClientIssue[] = [];

	private _pendingInjections: Pick<ClientSample, 'clientEvents' | 'clientIssues' | 'extensionStats' | 'attachments' | 'clientMetaItems'> = {};
	private _activeSample?: ClientSample;

	private closeTimer?: ReturnType<typeof setTimeout>;

	public constructor(settings: ObservedClientSettings<AppData>, public readonly call: ObservedCall) {
		super();
		this.setMaxListeners(Infinity);

		this.eventScope = { observer: call.observer, observedCall: call, observedClient: this };
		this.sink = call.observer.config.createClientSink?.({ clientId: settings.clientId, observedCall: call });
		this.clientId = settings.clientId;
		this.appData = (settings.appData ?? {}) as AppData;

		this.settings = {
			closeClientIfIdleForMs: settings.closeClientIfIdleForMs,
		};

		if (this.sink) {
			const onError = (err: Error) => logger.warn('ClientSampleSink error for client %s: %o', this.clientId, err);

			this.sink.once('close', () => this.sink?.off('error', onError));
			this.sink.on('error', onError);
		}
	}

	public get numberOfPeerConnections() {
		return this.observedPeerConnections.size;
	}

	public get score() {
		return this.calculatedScore.value;
	}

	public close() {
		if (this.closed) return;

		this._flushPendingInjections();

		this.closed = true;

		Array.from(this.observedPeerConnections.values()).forEach((peerConnection) => peerConnection.close());
		if (!this.leftAt) {
			this.leftAt = this.lastSampleTimestamp;

			if (this.leftAt) {
				this.emit('left');
				this._notify('client-left', { ...this.eventScope });
			}
		}
		this.closedAt = Date.now();

		this.emit('close');
		this._notify('client-closed', { ...this.eventScope });

		try {
			this.sink?.end();
		} catch (err) {
			logger.warn('ClientSampleSink.end failed for client %s: %o', this.clientId, err);
		}
	}

	public accept(sample: ClientSample, context?: AcceptContext): void {
		if (this.closed) {
			logger.warn('Attempted to accept a sample on a closed client %s', this.clientId);

			return;
		}

		if (this.closeTimer) {
			clearTimeout(this.closeTimer);
			this.closeTimer = undefined;
		}

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

		this._mergePendingInjections(sample);

		// From here until the end of accept, `inject*` targets this sample directly (see `_activeSample`).
		this._activeSample = sample;

		const clientEventsPostBuffer: ClientEvent[] = [];

		for (const clientEvent of sample.clientEvents ?? []) {
			this._processClientEvent(clientEvent, clientEventsPostBuffer);
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
			const observedPeerConnection = this._updatePeerConnection(pcSample, context);

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

		this.receivingAudioBitrate = (this.deltaReceivedAudioBytes * 8) / (elapsedInSeconds);
		this.receivingVideoBitrate = (this.deltaReceivedVideoBytes * 8) / (elapsedInSeconds);
		this.sendingAudioBitrate = (this.deltaSentAudioBytes * 8) / (elapsedInSeconds);
		this.sendingVideoBitrate = (this.deltaSentVideoBytes * 8) / (elapsedInSeconds);
		this.currentAvgRttInMs = 0 < numberOfRttMeasurements ? sumOfRtts / numberOfRttMeasurements : undefined;

		this.calculatedScore.value = sample.score;

		this.lastSampleTimestamp = sample.timestamp;
		// emit update
		const elapsedTimeInMs = now - this.updated;

		this.emit('update', sample, elapsedTimeInMs, context);
		this._notify('client-updated', { ...this.eventScope, sample, elapsedTimeInMs, context });
		this.updated = now;

		// if result changed after update
		if (this.calculatedScore.value) {
			this.totalScoreSum += this.calculatedScore.value;
			++this.numberOfScoreMeasurements;
		}

		if (this.settings.closeClientIfIdleForMs !== undefined) {
			this.closeTimer = setTimeout(() => {
				this.close();
			}, this.settings.closeClientIfIdleForMs);
		}

		// Done processing this sample. Stop directing injections at it, then persist the FINAL,
		// injection-merged sample to the sink (this is why the sink write is here, not at the top).
		this._activeSample = undefined;
		try {
			this.sink?.write(sample);
		} catch (err) {
			logger.warn('ClientSampleSink.write failed for client %s: %o', this.clientId, err);
		}
	}

	public injectMetaData(metaData: ClientMetaData) {
		if (this.closed) return;

		if (this._activeSample) {
			if (!this._activeSample.clientMetaItems) this._activeSample.clientMetaItems = [];
			this._activeSample.clientMetaItems.push(metaData);
			this.addMetadata(metaData);

			return;
		}

		if (!this._pendingInjections.clientMetaItems) this._pendingInjections.clientMetaItems = [];
		this._pendingInjections.clientMetaItems.push(metaData);
	}

	public injectEvent(event: ClientEvent) {
		if (this.closed) return;

		if (this._activeSample) {
			if (!this._activeSample.clientEvents) this._activeSample.clientEvents = [];
			this._activeSample.clientEvents.push(event);
			this._processClientEvent(event);

			return;
		}

		if (!this._pendingInjections.clientEvents) this._pendingInjections.clientEvents = [];
		this._pendingInjections.clientEvents.push(event);
	}

	public injectIssue(issue: ClientIssue) {
		if (this.closed) return;

		if (this._activeSample) {
			if (!this._activeSample.clientIssues) this._activeSample.clientIssues = [];
			this._activeSample.clientIssues.push(issue);
			this.addIssue(issue);
			++this.deltaNumberOfIssues;

			return;
		}

		if (!this._pendingInjections.clientIssues) this._pendingInjections.clientIssues = [];
		this._pendingInjections.clientIssues.push(issue);
	}

	public injectExtensionStat(stat: ExtensionStat) {
		if (this.closed) return;

		if (this._activeSample) {
			if (!this._activeSample.extensionStats) this._activeSample.extensionStats = [];
			this._activeSample.extensionStats.push(stat);
			this.addExtensionStats(stat);

			return;
		}

		if (!this._pendingInjections.extensionStats) this._pendingInjections.extensionStats = [];
		this._pendingInjections.extensionStats.push(stat);
	}

	public injectAttachment(attachments: Record<string, unknown>) {
		if (this.closed) return;

		if (this._activeSample) {
			if (!this._activeSample.attachments) this._activeSample.attachments = {};
			Object.assign(this._activeSample.attachments, attachments);
			this.attachments = this._activeSample.attachments;

			return;
		}

		if (!this._pendingInjections.attachments) this._pendingInjections.attachments = {};
		Object.assign(this._pendingInjections.attachments, attachments);
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

		this._notify('client-metadata', { ...this.eventScope, metaData: metadata });
	}

	public addIssue(issue: ClientIssue) {
		if (this.closed) return;

		this._notify('client-issue', { ...this.eventScope, issue });
	}

	public addExtensionStats(stats: ExtensionStat) {
		this._notify('client-extension-stats', { ...this.eventScope, extensionStats: stats });
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
						this._notify('client-joined', { ...this.eventScope });
					} else if (this.joinedAt < event.timestamp) {
						this._notify('client-rejoined', { ...this.eventScope, timestamp: event.timestamp });
					} else {
						this.joinedAt = event.timestamp;
						logger.warn(`Client ${this.clientId} joinedAt timestamp was updated to ${event.timestamp}. the joined event will not be emitted.`);
					}
				}
				logger.debug('Client %s joined at %o', this.clientId, event);
				break;
			}
			case ClientEventTypes.CLIENT_LEFT: {
				if (event.timestamp) {
					if (!this.leftAt) {
						this.leftAt = event.timestamp;
						this.emit('left');
						this._notify('client-left', { ...this.eventScope });
					} else {
						logger.warn(`Client ${this.clientId} leftAt timestamp was already set`);
					}

				}
				logger.debug('Client %s left at %o', this.clientId, event);
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
						logger.warn('Received PEER_CONNECTION_OPENED event without a corresponding observedPeerConnection: %o', event);
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
						logger.warn('Received PEER_CONNECTION_CLOSED event without a corresponding observedPeerConnection: %o', event);
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
						logger.warn('Received MEDIA_TRACK_ADDED event without a corresponding observedPeerConnection or observedTrack: %o', event);
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
						logger.warn('Received MEDIA_TRACK_REMOVED event without a corresponding observedPeerConnection or observedTrack: %o', event);
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
						logger.warn('Received DATA_CHANNEL_OPENED event without a corresponding observedPeerConnection or observedDataChannel: %o', event);
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
						logger.warn('Received DATA_CHANNEL_CLOSE event without a corresponding observedPeerConnection or observedDataChannel: %o', event);
					}
				}
				break;
			}
			case ClientEventTypes.MEDIA_TRACK_MUTED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.trackId && typeof payload.trackId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedInboundTrack = observedPeerConnection?.observedInboundTracks.get(payload.trackId);
					const observedOutboundTrack = observedPeerConnection?.observedOutboundTracks.get(payload.trackId);

					if (observedPeerConnection) {
						if (observedInboundTrack) {
							observedInboundTrack.muted = true;
							this._notify('inbound-track-muted', { ...this.eventScope, observedPeerConnection, observedInboundTrack });
						} else if (observedOutboundTrack) {
							observedOutboundTrack.muted = true;
							this._notify('outbound-track-muted', { ...this.eventScope, observedPeerConnection, observedOutboundTrack });
						}
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received MEDIA_TRACK_MUTED event without a corresponding observedPeerConnection or observedTrack: %o', event);
					}
				}

				break;
			}
			case ClientEventTypes.MEDIA_TRACK_UNMUTED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.trackId && typeof payload.trackId === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);
					const observedInboundTrack = observedPeerConnection?.observedInboundTracks.get(payload.trackId);
					const observedOutboundTrack = observedPeerConnection?.observedOutboundTracks.get(payload.trackId);

					if (observedPeerConnection) {
						if (observedInboundTrack) {
							observedInboundTrack.muted = false;
							this._notify('inbound-track-unmuted', { ...this.eventScope, observedPeerConnection, observedInboundTrack });
						} else if (observedOutboundTrack) {
							observedOutboundTrack.muted = false;
							this._notify('outbound-track-unmuted', { ...this.eventScope, observedPeerConnection, observedOutboundTrack });
						}
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received MEDIA_TRACK_UNMUTED event without a corresponding observedPeerConnection or observedTrack: %o', event);
					}
				}
				break;
			}
			case ClientEventTypes.ICE_CONNECTION_STATE_CHANGED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.iceConnectionState && typeof payload.iceConnectionState === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);

					if (observedPeerConnection) {
						observedPeerConnection.iceConnectionState = payload.iceConnectionState as 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';
						this._notify('ice-connection-state-changed', { ...this.eventScope, observedPeerConnection, state: payload.iceConnectionState });
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received ICE_CONNECTION_STATE_CHANGED event without a corresponding observedPeerConnection: %o', event);
					}
				}
				break;
			}
			case ClientEventTypes.ICE_GATHERING_STATE_CHANGED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.iceGatheringState && typeof payload.iceGatheringState === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);

					if (observedPeerConnection) {
						observedPeerConnection.iceGatheringState = payload.iceGatheringState as 'new' | 'gathering' | 'complete';
						this._notify('ice-gathering-state-changed', { ...this.eventScope, observedPeerConnection, state: payload.iceGatheringState });
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received ICE_GATHERING_STATE_CHANGED event without a corresponding observedPeerConnection: %o', event);
					}
				}
				break;
			}
			case ClientEventTypes.PEER_CONNECTION_STATE_CHANGED: {
				const payload = parseJsonAs<Record<string, unknown>>(event.payload);

				if (payload?.peerConnectionId && typeof payload.peerConnectionId === 'string' && payload?.peerConnectionState && typeof payload.peerConnectionState === 'string') {
					const observedPeerConnection = this.observedPeerConnections.get(payload.peerConnectionId);

					if (observedPeerConnection) {
						observedPeerConnection.connectionState = payload.peerConnectionState as 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
						this._notify('connection-state-changed', { ...this.eventScope, observedPeerConnection, state: payload.peerConnectionState });
					} else if (postBuffer) {
						postBuffer.push(event);
					} else {
						logger.warn('Received PEER_CONNECTION_STATE_CHANGED event without a corresponding observedPeerConnection: %o', event);
					}
				}
				break;
			}
		}

		this._notify('client-event', { ...this.eventScope, event });
	}

	private _updatePeerConnection(sample: PeerConnectionSample, context?: AcceptContext): ObservedPeerConnection | undefined {
		let observedPeerConnection = this.observedPeerConnections.get(sample.peerConnectionId);

		if (!observedPeerConnection) {
			if (!sample.peerConnectionId) {
				return (logger.warn(
					`ObservedClient received an invalid PeerConnectionSample (missing peerConnectionId field). ClientId: ${this.clientId}, CallId: ${this.call.callId}`,
					sample
				), void 0);
			}

			const newObservedPeerConnection = new ObservedPeerConnection(sample.peerConnectionId, this);

			newObservedPeerConnection.once('close', () => {
				this.observedPeerConnections.delete(sample.peerConnectionId);
			});
			this.observedPeerConnections.set(sample.peerConnectionId, newObservedPeerConnection);

			this._notify('peer-connection-added', { ...this.eventScope, observedPeerConnection: newObservedPeerConnection });

			observedPeerConnection = newObservedPeerConnection;
		}

		observedPeerConnection.accept(sample, context);

		return observedPeerConnection;
	}

	private _mergePendingInjections(sample: ClientSample): ClientSample {
		if (this.closed) return sample;

		if (this._pendingInjections.clientEvents) {
			if (!sample.clientEvents) sample.clientEvents = [];
			sample.clientEvents.push(...this._pendingInjections.clientEvents);

			this._pendingInjections.clientEvents = undefined;
		}

		if (this._pendingInjections.clientIssues) {
			if (!sample.clientIssues) sample.clientIssues = [];
			sample.clientIssues.push(...this._pendingInjections.clientIssues);

			this._pendingInjections.clientIssues = undefined;
		}

		if (this._pendingInjections.extensionStats) {
			if (!sample.extensionStats) sample.extensionStats = [];
			sample.extensionStats.push(...this._pendingInjections.extensionStats);

			this._pendingInjections.extensionStats = undefined;
		}

		if (this._pendingInjections.attachments) {
			if (!sample.attachments) sample.attachments = {};
			Object.assign(sample.attachments, this._pendingInjections.attachments);

			this._pendingInjections.attachments = undefined;
		}

		if (this._pendingInjections.clientMetaItems) {
			if (!sample.clientMetaItems) sample.clientMetaItems = [];
			sample.clientMetaItems.push(...this._pendingInjections.clientMetaItems);

			this._pendingInjections.clientMetaItems = undefined;
		}

		return sample;
	}

	private _flushPendingInjections() {
		const hasPending = Boolean(
			this._pendingInjections.clientEvents ||
			this._pendingInjections.clientIssues ||
			this._pendingInjections.extensionStats ||
			this._pendingInjections.clientMetaItems ||
			this._pendingInjections.attachments,
		);

		if (!hasPending) return;

		const finalSample: ClientSample = { timestamp: Date.now() };

		this._mergePendingInjections(finalSample);

		for (const clientEvent of finalSample.clientEvents ?? []) this._processClientEvent(clientEvent);
		for (const metaData of finalSample.clientMetaItems ?? []) this.addMetadata(metaData);
		for (const issue of finalSample.clientIssues ?? []) this.addIssue(issue);
		for (const extensionStat of finalSample.extensionStats ?? []) this.addExtensionStats(extensionStat);
		if (finalSample.attachments) this.attachments = { ...this.attachments, ...finalSample.attachments };

		try {
			this.sink?.write(finalSample);
		} catch (err) {
			logger.warn('ClientSampleSink.write failed during injection flush for client %s: %o', this.clientId, err);
		}
	}

	/** Emit an Observer-bus event scoped to this client (or a peer connection under it). */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.call.observer.emit(type, ...args);
	}
}
