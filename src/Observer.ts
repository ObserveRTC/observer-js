import { createLogger } from './common/logger';
import { Middleware, MiddlewareProcessor } from './common/Middleware';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientEvent, ClientMetaData, ClientIssue, ExtensionStat } from './schema/ClientSample';
import { ObservedClient } from './ObservedClient';

const logger = createLogger('Observer');

export type ObserverEvents = {
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

export class Observer extends EventEmitter {
	public readonly processors = {
		events: new MiddlewareProcessor<ProcessorInputContext<ClientEvent>>(),
		metaData: new MiddlewareProcessor<ProcessorInputContext<ClientMetaData>>(),
		issues: new MiddlewareProcessor<ProcessorInputContext<ClientIssue>>(),
		extensionStats: new MiddlewareProcessor<ProcessorInputContext<ExtensionStat>>(),
	};

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

	public addClientEventMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientEvent>>[]): Observer {

		this.processors.events.addMiddleware(...middlewares);

		return this;
	}

	public removeClientEventMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientEvent>>[]): Observer {

		this.processors.events.removeMiddleware(...middlewares);

		return this;
	}

	public addClientMetaDataMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientMetaData>>[]): Observer {

		this.processors.metaData.addMiddleware(...middlewares);

		return this;
	}

	public removeClientMetaDataMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientMetaData>>[]): Observer {

		this.processors.metaData.removeMiddleware(...middlewares);

		return this;
	}

	public addClientIssueMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientIssue>>[]): Observer {

		this.processors.issues.addMiddleware(...middlewares);

		return this;
	}

	public removeClientIssueMiddleware(...middlewares: Middleware<ProcessorInputContext<ClientIssue>>[]): Observer {

		this.processors.issues.removeMiddleware(...middlewares);

		return this;
	}

	public addExtensionStatMiddleware(...middlewares: Middleware<ProcessorInputContext<ExtensionStat>>[]): Observer {

		this.processors.extensionStats.addMiddleware(...middlewares);

		return this;
	}

	public removeExtensionStatMiddleware(...middlewares: Middleware<ProcessorInputContext<ExtensionStat>>[]): Observer {

		this.processors.extensionStats.removeMiddleware(...middlewares);

		return this;
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
