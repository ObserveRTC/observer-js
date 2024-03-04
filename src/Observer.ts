import { createLogger } from './common/logger';
import { StorageProvider, createSimpleStorageProvider } from './storages/StorageProvider';
import { ObservedCall, ObservedCallConfig } from './ObservedCall';
import { ReportsCollector } from './ReportsCollector';
import { EventEmitter } from 'events';
import { PartialBy } from './common/utils';
import { createCallStartedEventReport } from './common/callEventReports';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'newcall': [ObservedCall],
	// 'newsfu': [ObservedSfu],
	'close': [],
}

export type ObserverConfig = {

	/**
	 *
	 * Sets the default serviceId for samples.
	 *
	 * For more information about a serviceId please visit https://observertc.org
	 *
	 */
	defaultServiceId: string;

	/**
	 * Sets the default mediaUnitId for samples.
	 *
	 * For more information about a mediaUnitId please visit https://observertc.org
	 */
	defaultMediaUnitId: string;

	maxReports?: number | undefined;
	maxCollectingTimeInMs?: number | undefined;

	storages?: StorageProvider;
};

export declare interface Observer {
	on<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	off<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	once<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	emit<U extends keyof ObserverEvents>(event: U, ...args: ObserverEvents[U]): boolean;
}

export class Observer extends EventEmitter {
	public static create(providedConfig: Partial<ObserverConfig>): Observer {
		const config: ObserverConfig = Object.assign(
			{
				defaultServiceId: 'default-service-id',
				defaultMediaUnitId: 'default-media-unit-id',
				evaluator: {
					fetchSamples: true,
					maxIdleTimeInMs: 300 * 1000,
				},
				sink: {},
				logLevel: 'info',
			},
			providedConfig
		);

		const storages = providedConfig.storages ?? createSimpleStorageProvider();
		
		return new Observer(config, storages);
	}

	public readonly reports = new ReportsCollector();
	private readonly _observedCalls = new Map<string, ObservedCall>();
	private _reportTimer?: ReturnType<typeof setTimeout>;
	private _closed = false;
	public constructor(
		public readonly config: ObserverConfig,
		private readonly _storages: StorageProvider,
	) {
		super();
		logger.debug('Observer is created with config', this.config);
		const onNewReport = (collectedReports: number) => {
			if (!this.config.maxReports || this._closed) return;
			if (this.config.maxReports < collectedReports) {
				this._emitReports();
			}
		};

		this.once('close', () => this.reports.off('newreport', onNewReport));
		this.reports.on('newreport', onNewReport);
	}

	public async createObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		config: PartialBy<ObservedCallConfig<T>, 'serviceId' | 'defaultMediaUnitId' | 'started'>
	): Promise<ObservedCall<T>> {
		if (this._closed) {
			throw new Error('Attempted to create a call source on a closed observer');
		}

		const call = await ObservedCall.create({
			serviceId: this.config.defaultServiceId,
			defaultMediaUnitId: this.config.defaultMediaUnitId,
			started: Date.now(),
			...config,
		}, this._storages, this.reports);

		if (this._closed) throw new Error('Cannot create an observed call on a closed observer');
		if (this._observedCalls.has(call.callId)) throw new Error(`Observed Call with id ${call.callId} already exists`);

		call.once('close', () => {
			this._observedCalls.delete(call.callId);
			this.reports.addCallEventReport(createCallStartedEventReport(
				call.serviceId,
				call.roomId,
				call.callId,
				Date.now(),
			));
		});

		this._observedCalls.set(call.callId, call);
		this.reports.addCallEventReport(createCallStartedEventReport(
			call.serviceId,
			call.roomId,
			call.callId,
			call.started,
		));

		this.emit('newcall', call);
		
		return call;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) {
			return logger.debug('Attempted to close twice');
		}
		this._closed = true;
		
		this.emit('close');
	}

	private _emitReports() {
		if (this._reportTimer) {
			clearTimeout(this._reportTimer);
			this._reportTimer = undefined;
		}

		this.reports.emit();

		if (this.config.maxCollectingTimeInMs) {
			this._reportTimer = setTimeout(() => {
				this._reportTimer = undefined;
				this._emitReports();
			}, this.config.maxCollectingTimeInMs);
		}
	}
}
