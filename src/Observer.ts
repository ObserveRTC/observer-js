import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientEvent, ClientMetaData, ClientIssue, ExtensionStat, ClientSample } from './schema/ClientSample';
import { ObservedClient } from './ObservedClient';
import { ObservedTURN } from './ObservedTURN';
import { Detectors } from './detectors/Detectors';
import { Updater } from './updaters/Updater';
import { OnIntervalUpdater } from './updaters/OnIntervalUpdater';
import { OnAllCallObserverUpdater } from './updaters/OnAllCallObserverUpdater';
import { OnAnyCallObserverUpdater } from './updaters/OnAnyCallObserverUpdater';
import { ObserverEventMonitor } from './ObserverEventMonitor';
import { MediasoupRemoteTrackResolver } from './utils/MediasoupRemoteTrackResolver';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'client-event': [ObservedClient, ClientEvent];
	'call-updated': [ObservedCall],
	'client-issue': [ObservedClient, ClientIssue];
	'client-metadata': [ObservedClient, ClientMetaData];
	'client-extension-stats': [ObservedClient, ExtensionStat];
	'newcall': [ObservedCall],
	'update': [],
	'close': [],
}

export type ObserverConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	updatePolicy?: 'update-on-any-call-updated' | 'update-when-all-call-updated' | 'update-on-interval',
	updateIntervalInMs?: number,
	defaultCallUpdatePolicy?: ObservedCallSettings['updatePolicy'],
	defaultCallUpdateIntervalInMs?: number,
	appData?: AppData,
	closeClientIfIdleForMs?: number,
	closeCallIfEmptyForMs?: number,
}

export declare interface Observer {
	on<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	off<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	once<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	emit<U extends keyof ObserverEvents>(event: U, ...args: ObserverEvents[U]): boolean;
}

export class Observer<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly detectors: Detectors;

	public readonly observedTURN = new ObservedTURN();
	public readonly observedCalls = new Map<string, ObservedCall>();
	public updater?: Updater;
	
	public closed = false;

	public totalAddedCall = 0;
	public totalRemovedCall = 0;
	public totalRttLt50Measurements = 0;
	public totalRttLt150Measurements = 0;
	public totalRttLt300Measurements = 0;
	public totalRttGtOrEq300Measurements = 0;
	public totalClientIssues = 0;

	public numberOfClientsUsingTurn = 0;
	public numberOfClients = 0;
	public numberOfInboundRtpStreams = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfDataChannels = 0;
	public numberOfPeerConnections = 0;
	
	public get numberOfCalls() {
		return this.observedCalls.size;
	}

	private _timer?: ReturnType<typeof setInterval>;

	public constructor(public readonly config: ObserverConfig<AppData> = {
		updatePolicy: 'update-when-all-call-updated',
		updateIntervalInMs: undefined,
		appData: {} as AppData,
	}) {
		super();
		this.setMaxListeners(Infinity);
		this.update = this.update.bind(this);

		const currentUpdatePolicy = (config?.updatePolicy) ?? 'update-when-all-call-updated';

		switch (currentUpdatePolicy) {
			case 'update-on-any-call-updated':
				this.updater = new OnAnyCallObserverUpdater(this);
				break;
			case 'update-when-all-call-updated':
				this.updater = new OnAllCallObserverUpdater(this);
				break;
			case 'update-on-interval': {
				const interval = config?.updateIntervalInMs;

				if (!interval) {
					throw new Error('updateIntervalInMs setting in config must be set if updatePolicy is update-on-interval');
				}
				this.updater = new OnIntervalUpdater(
					interval,
					this.update.bind(this),
				);
				break;
			}
		}
		
		this.detectors = new Detectors();
	}

	public get appData() {
		return this.config.appData;
	}

	public getObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(callId: string): ObservedCall<T> | undefined {
		if (this.closed || !this.observedCalls.has(callId)) return;
		
		return this.observedCalls.get(callId) as ObservedCall<T>;
	}

	public createObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedCallSettings<T>
	): ObservedCall<T> {
		if (this.closed) {
			throw new Error('Attempted to create a call source on a closed observer');
		}
		if (!settings.updatePolicy) {
			settings.updatePolicy = this.config.defaultCallUpdatePolicy;
			settings.updateIntervalInMs = this.config.defaultCallUpdateIntervalInMs;
		}
		if (!settings.closeCallIfEmptyForMs) {
			settings.closeCallIfEmptyForMs = this.config.closeCallIfEmptyForMs;
		}
		
		const observedCall = new ObservedCall(settings, this);
		const onCallUpdated = () => this._onObservedCallUpdated(observedCall);

		if (this.observedCalls.has(observedCall.callId)) throw new Error(`Observed Call with id ${observedCall.callId} already exists`);

		if (settings.remoteTrackResolvePolicy === 'mediasoup-sfu') {
			observedCall.remoteTrackResolver = new MediasoupRemoteTrackResolver(observedCall);
		} else if (settings.remoteTrackResolvePolicy === 'p2p') {
			// For future implementation
		} else if (settings.remoteTrackResolvePolicy === 'none' || !settings.remoteTrackResolvePolicy) {
			// do nothing
		}

		observedCall.once('close', () => {
			this.observedCalls.delete(observedCall.callId);
			observedCall.off('update', onCallUpdated);
			++this.totalRemovedCall;
		});

		this.observedCalls.set(observedCall.callId, observedCall);
		observedCall.on('update', onCallUpdated);
		++this.totalAddedCall;

		this.emit('newcall', observedCall);
		
		return observedCall;
	}

	public close() {
		if (this.closed) {
			return logger.debug('Attempted to close twice');
		}
		this.closed = true;
		clearInterval(this._timer);
		this._timer = undefined;

		this.observedCalls.forEach((call) => call.close());
		
		this.emit('close');
	}

	public accept(sample: ClientSample) {
		if (this.closed) return;
		if (!sample.callId) return logger.warn('Received sample without callId. %o', sample);
		if (!sample.clientId) return logger.warn('Received sample without clientId %o', sample);

		const call = this.getObservedCall(sample.callId) ?? this.createObservedCall({
			callId: sample.callId,
			updateIntervalInMs: this.config.defaultCallUpdateIntervalInMs,
			updatePolicy: this.config.defaultCallUpdatePolicy,
		});

		const client = call.getObservedClient(sample.clientId) ?? call.createObservedClient({
			clientId: sample.clientId,
		});

		client.accept(sample);
	}

	public update() {
		if (this.closed) {
			return;
		}

		this.numberOfInboundRtpStreams = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfPeerConnections = 0;
		this.numberOfDataChannels = 0;
		this.numberOfClients = 0;
		this.numberOfClientsUsingTurn = 0;

		for (const call of this.observedCalls.values()) {
			this.numberOfInboundRtpStreams += call.numberOfInboundRtpStreams;
			this.numberOfOutboundRtpStreams += call.numberOfOutboundRtpStreams;
			this.numberOfPeerConnections += call.numberOfPeerConnections;
			this.numberOfDataChannels += call.numberOfDataChannels;
			this.numberOfClients += call.numberOfClients;
			this.numberOfClientsUsingTurn += call.clientsUsedTurn.size;
		}

		this.observedTURN.update();

		this.emit('update');
	}

	private _onObservedCallUpdated(call: ObservedCall) {
		this.totalRttLt50Measurements += call.deltaRttLt50Measurements;
		this.totalRttLt150Measurements += call.deltaRttLt150Measurements;
		this.totalRttLt300Measurements += call.deltaRttLt300Measurements;
		this.totalRttGtOrEq300Measurements += call.deltaRttGtOrEq300Measurements;
		this.totalClientIssues += call.deltaNumberOfIssues;
	}

	public createEventMonitor<CTX = unknown>(ctx?: CTX): ObserverEventMonitor<CTX> {
		return new ObserverEventMonitor<CTX>(this, ctx ?? {} as CTX);
	}

	// public resetSummaryMetrics() {
	// 	this.totalAddedCall = 0;
	// 	this.totalRemovedCall = 0;
	// 	this.totalRttLt50Measurements = 0;
	// 	this.totalRttLt150Measurements = 0;
	// 	this.totalRttLt300Measurements = 0;
	// 	this.totalRttGtOrEq300Measurements = 0;
	// 	this.totalClientIssues = 0;
	// }

	// public createSummary(): ObserverSummary {
	// 	return {
	// 		totalAddedCall: this.totalAddedCall,
	// 		totalRemovedCall: this.totalRemovedCall,
	// 		totalRttLt50Measurements: this.totalRttLt50Measurements,
	// 		totalRttLt150Measurements: this.totalRttLt150Measurements,
	// 		totalRttLt300Measurements: this.totalRttLt300Measurements,
	// 		totalRttGtOrEq300Measurements: this.totalRttGtOrEq300Measurements,

	// 		totalClientIssues: this.totalClientIssues,
	// 		currentActiveCalls: this.observedCalls.size,
	// 		currentNumberOfClients: this.numberOfClients,
	// 		currentNumberOfClientsUsingTURN: this.numberOfClientsUsedTurn,
	// 	};
	// }

}
