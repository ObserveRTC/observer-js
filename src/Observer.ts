import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientEvent, ClientMetaData, ClientIssue, ExtensionStat, ClientSample } from './schema/ClientSample';
import { ObservedClient } from './ObservedClient';
import { ObservedTURN } from './ObservedTURN';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'client-event': [ObservedClient, ClientEvent];
	'call-updated': [ObservedCall],
	'client-issue': [ObservedClient, ClientIssue],
	'client-metadata': [ObservedClient, ClientMetaData],
	'client-extension-stats': [ObservedClient, ExtensionStat],
	'newcall': [ObservedCall],
	'close': [],
}

export type ObserverConfig = {
	updateIntervalInMs?: number,
}

export declare interface Observer {
	on<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	off<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	once<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	emit<U extends keyof ObserverEvents>(event: U, ...args: ObserverEvents[U]): boolean;
}

export type ObserverSummary = {
	rttlt50: number;
}

export class Observer extends EventEmitter {
	public readonly observedTURN = new ObservedTURN();
	public readonly observedCalls = new Map<string, ObservedCall>();
	public readonly config: ObserverConfig;
	
	public closed = false;

	public numberOfClients = 0;
	public numberOfInboundRtpStreams = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfDataChannels = 0;
	public numberOfPeerConnections = 0;
	
	public get numberOfCalls() {
		return this.observedCalls.size;
	}

	private _timer?: ReturnType<typeof setInterval>;

	public constructor(config: ObserverConfig = {
		updateIntervalInMs: 10000,
	}) {
		super();
		this.setMaxListeners(Infinity);
		this.config = config;
		this.update = this.update.bind(this);

		if (this.config.updateIntervalInMs) {
			this._timer = setInterval(this.update.bind(this), this.config.updateIntervalInMs);
		}
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

		const observedCall = new ObservedCall(settings, this);

		if (this.observedCalls.has(observedCall.callId)) throw new Error(`Observed Call with id ${observedCall.callId} already exists`);

		observedCall.once('close', () => {
			this.observedCalls.delete(observedCall.callId);
			observedCall.off('update', this.update);
		});

		this.observedCalls.set(observedCall.callId, observedCall);
		observedCall.on('update', this.update);

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

	public accept(sample: ClientSample & { callId: string; clientId: string }) {
		if (this.closed) return;
		if (!sample.callId) return logger.warn('Received sample without callId. %o', sample);
		if (!sample.clientId) return logger.warn('Received sample without clientId %o', sample);

		const call = this.getObservedCall(sample.callId);

		if (!call) {
			return logger.warn(`Received sample for unknown call ${sample.callId}. %o`, sample);
		}

		const client = call.getObservedClient(sample.clientId);

		if (!client) {
			return logger.warn(`Received sample for unknown client ${sample.clientId} in call ${sample.callId}. %o`, sample);
		}

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

		for (const call of this.observedCalls.values()) {
			this.numberOfInboundRtpStreams += call.numberOfInboundRtpStreams;
			this.numberOfOutboundRtpStreams += call.numberOfOutboundRtpStreams;
			this.numberOfPeerConnections += call.numberOfPeerConnections;
			this.numberOfDataChannels += call.numberOfDataChannels;
			this.numberOfClients += call.numberOfClients;
		}

		this.observedTURN.update();
	}

}
