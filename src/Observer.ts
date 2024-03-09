import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallModel } from './ObservedCall';
import { ReportsCollector } from './ReportsCollector';
import { EventEmitter } from 'events';
import { PartialBy } from './common/utils';
import { createCallEndedEventReport, createCallStartedEventReport } from './common/callEventReports';
import { ObserverSinkContext } from './common/types';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'newcall': [ObservedCall],
	// 'newsfu': [ObservedSfu],
	'reports': [ObserverSinkContext],
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
	
	maxEntryIdleTimeInMs?: number | undefined;
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

		return new Observer(config);
	}

	public readonly reports = new ReportsCollector();
	private readonly _observedCalls = new Map<string, ObservedCall>();
	private _reportTimer?: ReturnType<typeof setTimeout>;
	private _closed = false;
	public constructor(
		public readonly config: ObserverConfig,
	) {
		super();
		this.setMaxListeners(Infinity);

		logger.debug('Observer is created with config', this.config);

		const onReports = (context: ObserverSinkContext) => this.emit('reports', context);
		const onNewReport = (collectedReports: number) => {
			if (!this.config.maxReports || this._closed) return;
			if (this.config.maxReports < collectedReports) {
				this._emitReports();
			}
		};

		this._emitReports();

		this.once('close', () => { 
			this.reports.off('newreport', onNewReport); 
			this.reports.off('reports', onReports);
		});
		this.reports.on('newreport', onNewReport);
		this.reports.on('reports', onReports);
	}

	public createObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		config: PartialBy<ObservedCallModel, 'serviceId' | 'started'> & { appData: T }
	): ObservedCall<T> {
		if (this._closed) {
			throw new Error('Attempted to create a call source on a closed observer');
		}

		const { appData, ...model } = config;
		const call = new ObservedCall({
			...model,
			serviceId: this.config.defaultServiceId,
			started: Date.now(),
		}, this, appData);

		if (this._closed) throw new Error('Cannot create an observed call on a closed observer');
		if (this._observedCalls.has(call.callId)) throw new Error(`Observed Call with id ${call.callId} already exists`);

		call.once('close', () => {
			this._observedCalls.delete(call.callId);
			this.reports.addCallEventReport(createCallEndedEventReport(
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

	public get observedCalls(): ReadonlyMap<string, ObservedCall> {
		return this._observedCalls;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) {
			return logger.debug('Attempted to close twice');
		}
		this._closed = true;

		this._observedCalls.forEach((call) => call.close());
		
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
