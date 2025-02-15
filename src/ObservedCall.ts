import { EventEmitter } from 'events';
import { ObservedClient, ObservedClientSettings } from './ObservedClient';
import { Observer } from './Observer';
import { ScoreCalculator } from './scores/ScoreCalculator';
import { CalculatedScore } from './scores/CalculatedScore';
import { DefaultCallScoreCalculator } from './scores/DefaultCallScoreCalculator';
import { Detectors } from './detectors/Detectors';
import { RemoteTrackResolver } from './utils/RemoteTrackResolver';
import { OnAllClientCallUpdater } from './updaters/OnAllClientCallUpdater';
import { Updater } from './updaters/Updater';
import { OnIntervalUpdater } from './updaters/OnIntervalUpdater';
import { OnAnyClientCallUpdater } from './updaters/OnAnyClientCallUpdater';

export type ObservedCallSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	appData?: AppData;
	remoteTrackResolvePolicy?: 'p2p' | 'mediasoup-sfu',
	updatePolicy?: 'update-on-any-client-updated' | 'update-when-all-client-updated' | 'update-on-interval',
	updateIntervalInMs?: number,
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
	empty: [],
	'not-empty': [],
	close: [],
}

export declare interface ObservedCall {
	on<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	off<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	once<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	emit<U extends keyof ObservedCallEvents>(event: U, ...args: ObservedCallEvents[U]): boolean;
}

export class ObservedCall<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly detectors: Detectors;
	public updater?: Updater;
	public scoreCalculator: ScoreCalculator;
	public readonly callId: string;
	public readonly observedClients = new Map<string, ObservedClient>();
	public readonly clientsUsedTurn = new Set<string>();
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public remoteTrackResolver?: RemoteTrackResolver;
	
	public totalAddedClients = 0;
	public totalRemovedClients = 0;

	public totalClientsReceivedAudioBytes = 0;
	public totalClientsReceivedVideoBytes = 0;
	public totalClientsReceivedDataChannelBytes = 0;
	public totalClientsReceivedBytes = 0;

	public totalClientsSentAudioBytes = 0;
	public totalClientsSentDataChannelBytes = 0;
	public totalClientsSentVideoBytes = 0;
	public totalClientsSentBytes = 0;

	public totalRttLt50Measurements = 0;
	public totalRttLt150Measurements = 0;
	public totalRttLt300Measurements = 0;
	public totalRttGtOrEq300Measurements = 0;

	public numberOfIssues = 0;
	public numberOfPeerConnections = 0;
	public numberOfInboundRtpStreams = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfDataChannels = 0;

	public maxNumberOfClients = 0;
	public deltaNumberOfIssues = 0;

	public deltaRttLt50Measurements = 0;
	public deltaRttLt150Measurements = 0;
	public deltaRttLt300Measurements = 0;
	public deltaRttGtOrEq300Measurements = 0;

	public appData: AppData;
	public closed = false;
	public startedAt?: number;
	public endedAt?: number;
	public closedAt?: number;

	private _callStartedEvent: {
		emitted: boolean,
		timer?: ReturnType<typeof setTimeout>,
	};
	private _callEndedEvent: {
		emitted: boolean
	};

	public constructor(
		settings: ObservedCallSettings<AppData>,
		public readonly observer: Observer,
	) {
		super();
		this.setMaxListeners(Infinity);

		this.callId = settings.callId;
		this.appData = settings.appData ?? {} as AppData;
		this.scoreCalculator = new DefaultCallScoreCalculator(this);
		this.detectors = new Detectors();
		
		if (settings.updateIntervalInMs) {
			if (settings.updatePolicy !== 'update-on-interval') {
				throw new Error('updatePolicy must be update-on-interval if updateIntervalInMs is set in config');
			}
		}
		switch (settings.updatePolicy) {
			case 'update-on-any-client-updated':
				this.updater = new OnAllClientCallUpdater(this);	
				break;
			case 'update-when-all-client-updated':
				this.updater = new OnAnyClientCallUpdater(this);	
				break;
			case 'update-on-interval': 
				if (!settings.updateIntervalInMs) {
					throw new Error('updateIntervalInMs setting in config must be set if updatePolicy is update-on-interval');
				}
				this.updater = new OnIntervalUpdater(
					settings.updateIntervalInMs,
					this.update.bind(this),
				);
				break;
		}

		switch (settings.remoteTrackResolvePolicy) {
			case 'mediasoup-sfu':
				break;
		}

		this._callStartedEvent = {
			emitted: false,
		};
		this._callEndedEvent = {
			emitted: false,
		};
	}

	public get numberOfClients() {
		return this.observedClients.size;
	}

	public get score() { 
		return this.calculatedScore.value; 
	}

	public close() {
		if (this.closed) return;
		this.update(); // last update before closing
		this.closed = true;

		this.updater?.close();

		[ ...this.observedClients.values() ].forEach((client) => client.close());

		this.closedAt = Date.now();
		this.emit('close');
	}

	public getObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(clientId: string): ObservedClient<ClientAppData> | undefined {
		if (this.closed || !this.observedClients.has(clientId)) return;
		
		return this.observedClients.get(clientId) as ObservedClient<ClientAppData>;
	}

	public createObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(settings: ObservedClientSettings<ClientAppData>): ObservedClient<ClientAppData> {
		if (this.closed) throw new Error(`Call ${this.callId} is closed`);
		if (this.observedClients.has(settings.clientId)) throw new Error(`Client with id ${settings.clientId} already exists`);

		const result = new ObservedClient<ClientAppData>(settings, this);
		const wasEmpty = this.observedClients.size === 0;
		const onUpdate = () => this._onClientUpdate(result);
		const joined = () => this._clientJoined(result);
		const left = () => this._clientLeft(result);

		result.once('close', () => {
			result.off('update', onUpdate);
			result.off('joined', joined);
			result.off('left', left);
			this.observedClients.delete(settings.clientId);

			if (this.observedClients.size === 0) {
				this.emit('empty');
			}
			++this.totalRemovedClients;
		});
		result.on('update', onUpdate);
		result.on('joined', joined);
		result.on('left', left);
		++this.totalAddedClients;

		this.observedClients.set(settings.clientId, result);
		this.maxNumberOfClients = Math.max(this.maxNumberOfClients, this.observedClients.size);

		this.emit('newclient', result);

		if (wasEmpty) {
			this.emit('not-empty');
		}
		
		return result;
	}

	public update() {
		if (this.closed) return;
		
		this.numberOfInboundRtpStreams = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfPeerConnections = 0;
		this.numberOfDataChannels = 0;

		for (const client of this.observedClients.values()) {
			this.numberOfInboundRtpStreams += client.numberOfInboundRtpStreams;
			this.numberOfOutboundRtpStreams += client.numberOfOutboundRtpStreams;
			this.numberOfPeerConnections += client.numberOfPeerConnections;
			this.numberOfDataChannels += client.numberOfDataChannels;
		}

		this.detectors.update();
		this.scoreCalculator.update();

		this.emit('update');

		this.deltaNumberOfIssues = 0;
		this.deltaRttLt50Measurements = 0;
		this.deltaRttLt150Measurements = 0;
		this.deltaRttLt300Measurements = 0;
		this.deltaRttGtOrEq300Measurements = 0;
	}

	private _onClientUpdate(client: ObservedClient) {
		this.totalClientsReceivedAudioBytes += client.deltaReceivedAudioBytes;
		this.totalClientsReceivedVideoBytes += client.deltaReceivedVideoBytes;
		this.totalClientsReceivedDataChannelBytes += client.deltaDataChannelBytesReceived;
		this.totalClientsReceivedBytes += client.deltaTransportReceivedBytes;
		this.totalClientsSentAudioBytes += client.deltaSentAudioBytes;
		this.totalClientsSentVideoBytes += client.deltaSentVideoBytes;
		this.totalClientsSentDataChannelBytes += client.deltaDataChannelBytesSent;
		this.totalClientsSentBytes += client.deltaTransportSentBytes;
		
		this.deltaRttLt50Measurements += client.deltaRttLt50Measurements;
		this.deltaRttLt150Measurements += client.deltaRttLt150Measurements;
		this.deltaRttLt300Measurements += client.deltaRttLt300Measurements;
		this.deltaRttGtOrEq300Measurements += client.deltaRttGtOrEq300Measurements;

		this.totalRttLt50Measurements += client.deltaRttLt50Measurements;
		this.totalRttLt150Measurements += client.deltaRttLt150Measurements;
		this.totalRttLt300Measurements += client.deltaRttLt300Measurements;
		this.totalRttGtOrEq300Measurements += client.deltaRttGtOrEq300Measurements;

		this.deltaNumberOfIssues += client.deltaNumberOfIssues;
		this.numberOfIssues += client.deltaNumberOfIssues;
		
		if (client.usingTURN) {
			this.clientsUsedTurn.add(client.clientId);
		}
	}

	private _clientJoined(client: ObservedClient) {
		if (!client.joinedAt) return;

		this.startedAt = Math.min(this.startedAt ?? client.joinedAt, client.joinedAt);
	}

	private _clientLeft(client: ObservedClient) {
		if (!client.leftAt) return;

		this.endedAt = Math.max(this.endedAt ?? client.leftAt, client.leftAt);
	}

	// public resetSummaryMetrics() {
	// 	this.totalAddedClients = 0;
	// 	this.totalRemovedClients = 0;

	// 	this.totalClientsReceivedAudioBytes = 0;
	// 	this.totalClientsReceivedVideoBytes = 0;
	// 	this.totalClientsReceivedBytes = 0;

	// 	this.totalClientsSentAudioBytes = 0;
	// 	this.totalClientsSentVideoBytes = 0;
	// 	this.totalClientsSentBytes = 0;

	// 	this.totalRttLt50Measurements = 0;
	// 	this.totalRttLt150Measurements = 0;
	// 	this.totalRttLt300Measurements = 0;
	// 	this.totalRttGtOrEq300Measurements = 0;

	// 	this.numberOfIssues = 0;

	// 	this.clientsUsedTurn.clear();
		
	// }

	// public createSummary(): ObservedCallSummary {
	// 	return {
	// 		currentActiveClients: this.observedClients.size,
	// 		totalAddedClients: this.totalAddedClients,
	// 		totalRemovedClients: this.totalRemovedClients,
			
	// 		totalClientsReceivedAudioBytes: this.totalClientsReceivedBytes,
	// 		totalClientsReceivedVideoBytes: this.totalClientsReceivedVideoBytes,
	// 		totalClientsReceivedBytes: this.totalClientsReceivedBytes,

	// 		totalClientsSentAudioBytes: this.totalClientsSentAudioBytes,
	// 		totalClientsSentVideoBytes: this.totalClientsSentVideoBytes,
	// 		totalClientsSentBytes: this.totalClientsSentBytes,

	// 		totalRttLt50Measurements: this.totalRttLt50Measurements,
	// 		totalRttLt150Measurements: this.totalRttLt150Measurements,
	// 		totalRttLt300Measurements: this.totalRttLt300Measurements,
	// 		totalRttGtOrEq300Measurements: this.totalRttGtOrEq300Measurements,

	// 		numberOfIssues: this.numberOfIssues,
	// 		numberOfClientsUsedTurn: this.clientsUsedTurn.size,
	// 	};
	// }
}