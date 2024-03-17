import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallModel } from './ObservedCall';
import { ReportsCollector } from './ReportsCollector';
import { EventEmitter } from 'events';
import { PartialBy } from './common/utils';
import { createCallEndedEventReport, createCallStartedEventReport } from './common/callEventReports';
import { ObserverSinkContext } from './common/types';
import { ObservedSfu, ObservedSfuModel } from './ObservedSfu';
import { CallSummaryMonitor } from './monitors/CallSummaryMonitor';
import { TurnUsageMonitor } from './monitors/TurnUsageMonitor';
import { ObservedClient } from './ObservedClient';
import { ObservedPeerConnection } from './ObservedPeerConnection';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'newcall': [ObservedCall],
	'newsfu': [ObservedSfu],
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
	private readonly _observedSfus = new Map<string, ObservedSfu>();
	private readonly _monitors = new Map<string, { close:() => void, once: (e: 'close', l: () => void) => void }>();

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
		config: PartialBy<ObservedCallModel, 'serviceId'> & { appData: T, started?: number }
	): ObservedCall<T> {
		if (this._closed) {
			throw new Error('Attempted to create a call source on a closed observer');
		}

		const { appData, started = Date.now(), ...model } = config;
		const call = new ObservedCall({
			...model,
			serviceId: this.config.defaultServiceId,
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
			started,
		));

		this.emit('newcall', call);
		
		return call;
	}

	public createObservedSfu<AppData extends Record<string, unknown> = Record<string, unknown>>(
		model: ObservedSfuModel,
		appData: AppData,
	): ObservedSfu<AppData> {
		if (this._closed) {
			throw new Error('Attempted to create an sfu source on a closed observer');
		}

		const sfu = new ObservedSfu<AppData>(model, this, appData);

		if (this._closed) throw new Error('Cannot create an observed sfu on a closed observer');
		if (this._observedSfus.has(sfu.sfuId)) throw new Error(`Observed SFU with id ${sfu.sfuId} already exists`);

		sfu.once('close', () => {
			this._observedSfus.delete(sfu.sfuId);
		});

		this._observedSfus.set(sfu.sfuId, sfu);
		this.emit('newsfu', sfu);
		
		return sfu;
	}

	public createCallSummaryMonitor(options?: { timeoutAfterCallClose?: number }): CallSummaryMonitor {
		if (this._closed) throw new Error('Cannot create a call summary monitor on a closed observer');

		const existingMonitor = this._monitors.get(CallSummaryMonitor.name);
		
		if (existingMonitor) return existingMonitor as CallSummaryMonitor;

		const monitor = new CallSummaryMonitor();
		const onNewCall = (call: ObservedCall) => {
			monitor.addCall(call);

			call.once('close', () => setTimeout(() => {
				const summary = monitor.takeSummary(call.callId);

				summary && monitor.emit('summary', summary);
				
			}, options?.timeoutAfterCallClose ?? 1000));
		};

		monitor.once('close', () => {
			this._monitors.delete(CallSummaryMonitor.name);
			this.off('newcall', onNewCall);
		});

		this._monitors.set(CallSummaryMonitor.name, monitor);
		this.on('newcall', onNewCall);
		
		this.once('close', () => {
			monitor.close();
		});

		return monitor;
	}

	public createTurnUsageMonitor() {
		if (this._closed) throw new Error('Cannot create a turn usage monitor on a closed observer');

		const existingMonitor = this._monitors.get(TurnUsageMonitor.name);
		
		if (existingMonitor) return existingMonitor as TurnUsageMonitor;

		const monitor = new TurnUsageMonitor();

		const onNewCall = (call: ObservedCall) => {
			const onNewClient = (client: ObservedClient) => {
				const onNewPeerConnection = (pc: ObservedPeerConnection) => {
					const onUsingTurnChanged = (usingTurn: boolean) => {
						if (usingTurn) monitor.addPeerConnection(pc);
						else monitor.removePeerConnection(pc);
					};

					pc.once('close', () => {
						pc.ICE.off('usingturnchanged', onUsingTurnChanged);
						monitor.removePeerConnection(pc);
					});
					pc.ICE.on('usingturnchanged', onUsingTurnChanged);
				};

				client.once('close', () => client.off('newpeerconnection', onNewPeerConnection));
				client.on('newpeerconnection', onNewPeerConnection);
			};

			call.once('close', () => call.off('newclient', onNewClient));
			call.on('newclient', onNewClient);
		};

		monitor.once('close', () => {
			this._monitors.delete(CallSummaryMonitor.name);
			this.off('newcall', onNewCall);
		});

		this._monitors.set(CallSummaryMonitor.name, monitor);
		this.on('newcall', onNewCall);
		
		this.once('close', () => {
			monitor.close();
		});

		return monitor;
	}

	public get observedCalls(): ReadonlyMap<string, ObservedCall> {
		return this._observedCalls;
	}

	public get observedSfus(): ReadonlyMap<string, ObservedSfu> {
		return this._observedSfus;
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
