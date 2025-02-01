import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientEvent, ClientMetaData, ClientIssue, ExtensionStat } from './schema/ClientSample';
import { ObservedClient } from './ObservedClient';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'client-event': [ObservedClient, ClientEvent];
	'call-updated': [ObservedCall],
	'issue-received': [ObservedClient, ClientIssue],
	'metadata-received': [ObservedClient, ClientMetaData],
	'extension-stats-received': [ObservedClient, ExtensionStat],
	'newcall': [ObservedCall],
	'close': [],
}

export type ProcessorInputContext<T> = {
	call: ObservedCall;
	client: ObservedClient;
	data: T;
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
	public readonly observedCalls = new Map<string, ObservedCall>();
	public closed = false;

	public constructor(
	) {
		super();
		this.setMaxListeners(Infinity);
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
		});

		this.observedCalls.set(observedCall.callId, observedCall);

		this.emit('newcall', observedCall);
		
		return observedCall;
	}

	public close() {
		if (this.closed) {
			return logger.debug('Attempted to close twice');
		}
		this.closed = true;

		this.observedCalls.forEach((call) => call.close());
		
		this.emit('close');
	}
}
