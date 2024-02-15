import { ClientSample, SfuSample } from '@observertc/sample-schemas-js';
import { ObservedCalls, ObservedCallsBuilder } from '../samples/ObservedCalls';
import { ObservedClientSource, ObservedClientSourceConfig } from './ObservedClientSource';
import { EventEmitter } from 'events';
import { createLogger } from '../common/logger';
import { PartialBy } from '../common/utils';
import { ObservedSfuSourceConfig, ObservedSfuSource } from './ObservedSfuSource';
import { ObservedSfus, ObservedSfusBuilder } from '../samples/ObservedSfus';
import { ObservedCallSource, ObservedCallSourceConfig } from './ObservedCallSource';

const logger = createLogger('Sources');

export type SourcesConfig = {
	maxSamples: number;
	maxTimeInMs: number;
};

export type SourcesEvents = {
	'observed-samples': {
		observedCalls: ObservedCalls;
		observedSfus: ObservedSfus;
		numberOfSamples: number;
	};
	'removed-client-source': ObservedClientSourceConfig;
	'added-client-source': ObservedClientSourceConfig;
	'removed-sfu-source': ObservedSfuSourceConfig;
	'added-sfu-source': ObservedSfuSourceConfig;
	'added-call-source': ObservedCallSource;
	'removed-call-source': ObservedCallSource;
};

export class Sources {
	
	private readonly _warnFlags = { autoEmitButEmitSamplesInvoked: false };
	private readonly _callSources = new Map<string, ObservedCallSource>();
	// private readonly _clientSources = new Map<string, ObservedClientSource>();
	private readonly _sfuSources = new Map<string, ObservedSfuSource>();
	private readonly _emitter = new EventEmitter();
	
	private _observedCallsBuilder = new ObservedCallsBuilder();
	private _observedSfusBuilder = new ObservedSfusBuilder();
	private _timer?: ReturnType<typeof setTimeout>;
	private _numberOfSamples = 0;

	public constructor(public readonly config: SourcesConfig) {}

	public getCallSource<T extends Record<string, unknown> = Record<string, unknown>>(callId: string): ObservedCallSource<T> | undefined {
		if (!this._callSources.has(callId)) return;
		
		return this._callSources.get(callId) as ObservedCallSource<T>;
	}

	public getSfuSource<T extends Record<string, unknown> = Record<string, unknown>>(sfuId: string) {
		if (!this._sfuSources.has(sfuId)) return;

		return this._sfuSources.get(sfuId) as ObservedSfuSource<T>;
	}

	public on<K extends keyof SourcesEvents>(event: K, listener: (data: SourcesEvents[K]) => void): this {
		this._emitter.addListener(event, listener);
		
		return this;
	}

	public off<K extends keyof SourcesEvents>(event: K, listener: (data: SourcesEvents[K]) => void): this {
		this._emitter.removeListener(event, listener);
		
		return this;
	}

	private _emit<K extends keyof SourcesEvents>(event: K, data: SourcesEvents[K]): boolean {
		return this._emitter.emit(event, data);
	}

	public createCallSource<T extends Record<string, unknown> = Record<string, unknown>>(
		config: ObservedCallSourceConfig<T>
	): ObservedCallSource<T> {
		let closed = false;
		const { 
			serviceId,
			mediaUnitId,
			appData, 
			...callConfig 
		} = config;
		const clientSources = new Map<string, ObservedClientSource>();
		const callSource: ObservedCallSource<T> = {
			...callConfig,
			appData,
			serviceId,
			mediaUnitId,
			get clients() {
				return clientSources.values();
			},

			getClientSource: <U extends Record<string, unknown> = Record<string, unknown>>(clientId: string) => {
				if (!clientSources.has(clientId)) return;
				else return clientSources.get(clientId) as ObservedClientSource<U>;
			},

			createClientSource: <U extends Record<string, unknown> = Record<string, unknown>>(context: ObservedClientSourceConfig<U>) => {
				const existingClientSource = clientSources.get(context.clientId);

				if (existingClientSource) return existingClientSource as ObservedClientSource<U>;
				
				const { appData: clientAppData, ...clientConfig } = context;
				const clientSource = this._createClientSource<U>(callSource, {
					...callConfig,
					...clientConfig,
					appData: clientAppData,
					serviceId,
					mediaUnitId,
				});
				const closeClientSource = clientSource.close;

				clientSource.close = () => {
					closeClientSource();
					clientSources.delete(context.clientId);
				};
				clientSources.set(context.clientId, clientSource);
				
				return clientSource as ObservedClientSource<U>;
			},
			close: () => {
				if (closed) {
					return;
				}
				closed = true;

				for (const clientSource of clientSources.values()) {
					clientSource.close();
				}
				clientSources.clear();
				this._callSources.delete(config.callId);

				this._emit('removed-call-source', callSource);
			},
			closed,
		};
		
		if (this._callSources.size < 1) {
			this._resetTimer();
		}
		this._callSources.set(config.callId, callSource);
		
		this._emit('added-call-source', callSource);
		
		return callSource;
	}

	private _createClientSource<T extends Record<string, unknown> = Record<string, unknown>>(callSource: ObservedCallSource, config: PartialBy<ObservedClientSourceConfig<T>, 'joined'>): ObservedClientSource<T> {
		let closed = false;
		const {
			appData,
			...clientConfig
		} = config;

		const source: ObservedClientSource<T> = {
			...clientConfig,
			appData,
			joined: config.joined ?? Date.now(),

			accept: (...samples: ClientSample[]) => {
				if (closed) {
					throw new Error('Cannot accept ClientSample, because the ClientSource is closed');
				}
				const observedCallBuilder = this._observedCallsBuilder.getOrCreateObservedCallBuilder(callSource.callId, () => {
					return {
						...callSource,
					};
				});
				const observedClientBuilder = observedCallBuilder.getOrCreateObservedClientBuilder(config.clientId, () => {
					return {
						...source,
					};
				});

				for (const sample of samples) {
					observedClientBuilder.addClientSample(sample);
				}
				this._incrementSamples(samples.length);
			},
			close: () => {
				if (closed) {
					return;
				}
				closed = true;
				this._emit('removed-client-source', source);
			},
			closed,
		};

		this._emit('added-client-source', source);
		
		return source;
	}

	public createSfuSource<T extends Record<string, unknown> = Record<string, unknown>>(config: PartialBy<ObservedSfuSourceConfig<T>, 'joined'>): ObservedSfuSource {
		const existingSfuSource = this._sfuSources.get(config.sfuId);

		if (existingSfuSource) {
			return existingSfuSource;
		}
		let closed = false;
		// config.joined = config.joined ?? Date.now();
		const source: ObservedSfuSource = {
			...config,
			joined: config.joined ?? Date.now(),

			accept: (...samples: SfuSample[]) => {
				if (closed) {
					throw new Error('Cannot accept SfuSample, because the SfuSource is closed');
				}
				const observedSfuBuilder = this._observedSfusBuilder.getOrCreateObservedSfuBuilder(config.sfuId, () => {
					return {
						...source,
					};
				});

				for (const sample of samples) {
					observedSfuBuilder.addSfuSample(sample);
				}
				this._incrementSamples(samples.length);
			},
			close: () => {
				if (closed) {
					return;
				}
				closed = true;
				this._sfuSources.delete(config.sfuId);
				this._emit('removed-sfu-source', source);
			},
			closed,
		};

		if (this._sfuSources.size < 1) {
			this._resetTimer();
		}
		this._sfuSources.set(config.sfuId, source);
		this._emit('added-sfu-source', source);
		
		return source;
	}

	private _incrementSamples(increment = 1) {
		this._numberOfSamples += increment;
		if (this.config.maxSamples < 1 || this._numberOfSamples < this.config.maxSamples) {
			return;
		}
		this._emitSamples();
	}

	public emitSamples() {
		if (0 < this.config.maxSamples || 0 < this.config.maxTimeInMs) {
			if (!this._warnFlags.autoEmitButEmitSamplesInvoked) {
				logger.warn(`Emitting Samples is called explicitly, 
					but samples are emitted automatically because of configuration 
					(maxSamples: ${this.config.maxSamples}, maxTImeInMs: ${this.config.maxTimeInMs})`
				);
				this._warnFlags.autoEmitButEmitSamplesInvoked = true;
			}
		}
		this._emitSamples();
	}

	private _emitSamples() {
		this._resetTimer();
		const observedCalls = this._observedCallsBuilder.build();

		this._observedCallsBuilder = new ObservedCallsBuilder();
		const observedSfus = this._observedSfusBuilder.build();

		this._observedSfusBuilder = new ObservedSfusBuilder();
		this._emit('observed-samples', {
			observedCalls,
			observedSfus,
			numberOfSamples: this._numberOfSamples,
		});
		this._numberOfSamples = 0;
	}

	private _resetTimer() {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = undefined;
		}
		if (0 < this.config.maxTimeInMs) {
			this._timer = setTimeout(() => {
				this._timer = undefined;
				this._emitSamples();
			}, this.config.maxTimeInMs);
		}
	}

	public close() {
		[ ...this._callSources.values() ].forEach((callSource) => callSource.close());
		[ ...this._sfuSources.values() ].forEach((sfuSource) => sfuSource.close());
		this._callSources.clear();
		this._sfuSources.clear();		
		this._emitSamples();
	}
}
