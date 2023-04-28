import { createLogger } from './common/logger';
import { Semaphore } from './common/Semaphore';
import { EvaluatorContext } from './common/types';
import { ReportsCollector } from './common/ReportsCollector';
import { ObservedClientSourceConfig } from './sources/ObservedClientSource';
import { SourcesEvents } from './sources/Sources';
import { StorageProvider } from './storages/StorageProvider';
import { createProcessor, Processor } from './middlewares/Processor';
import { createTransactionContext, TransactionContext } from './middlewares/TransactionContext';
import { Middleware } from './middlewares/Middleware';
import { CallOperationsContext, CallOperation, createCallOperationContext } from './middlewares/CallOperationsContext';
import { createCallProcessor } from './middlewares/CallProcessor';
import { createTransactionProcessor } from './middlewares/TransactoinProcessor';
import { EventEmitter } from 'events';

const logger = createLogger('Evaluator');

export type EvaluatorEvents = {
	ready: undefined;
};

export type EvaluatorConfig = {
	fetchSamples: boolean;
};

export type EvaluatorProcess = (evaluatorContext: EvaluatorContext) => Promise<void>;

export class Evaluator {
	private _index = 0;
	private _clientOperations = new Map<string, CallOperation>();
	private _emitter = new EventEmitter();

	private _evaluatorProcesses = new Map<EvaluatorProcess, Middleware<EvaluatorContext>>();
	private _callProcessor: Processor<CallOperationsContext>;
	private _transactionProcessor: Processor<TransactionContext>;
	private _customProcessor: Processor<EvaluatorContext>;

	private _evaluations = new Map<number, Promise<void>>();

	public constructor(
		public readonly config: EvaluatorConfig,
		private readonly _callSemaphore: Semaphore,
		private readonly _storageProvider: StorageProvider,
		private readonly _reportsCollector: ReportsCollector
	) {
		this._callProcessor = createCallProcessor(_storageProvider, _reportsCollector);

		this._transactionProcessor = createTransactionProcessor(
			_storageProvider,
			_reportsCollector,
			this.config.fetchSamples
		);

		this._customProcessor = createProcessor();
	}

	public addProcess(process: EvaluatorProcess) {
		const middleware: Middleware<EvaluatorContext> = async (context, next) => {
			await process(context);
			if (next) await next(context);
		};
		this._evaluatorProcesses.set(process, middleware);
		this._customProcessor.addMiddleware(middleware);
	}

	public removeProcess(process: EvaluatorProcess) {
		const middleware = this._evaluatorProcesses.get(process);
		if (!middleware) {
			return;
		}
		this._evaluatorProcesses.delete(process);
		this._customProcessor.removeMiddleware(middleware);
	}

	public addClosedClientSource(clientSource: ObservedClientSourceConfig) {
		this._clientOperations.set(clientSource.clientId, {
			type: 'detach',
			...clientSource,
			detached: Date.now(),
		});
	}

	public addCreatedClientSource(clientSource: ObservedClientSourceConfig) {
		this._clientOperations.set(clientSource.clientId, {
			type: 'join',
			...clientSource,
		});
	}

	public on<K extends keyof EvaluatorEvents>(event: K, listener: (data: EvaluatorEvents[K]) => void): this {
		this._emitter.addListener(event, listener);
		return this;
	}

	public off<K extends keyof EvaluatorEvents>(event: K, listener: (data: EvaluatorEvents[K]) => void): this {
		this._emitter.removeListener(event, listener);
		return this;
	}

	private _emit<K extends keyof EvaluatorEvents>(event: K, data: EvaluatorEvents[K]): boolean {
		return this._emitter.emit(event, data);
	}

	public addObservedSamples(samples: SourcesEvents['observed-samples']): void {
		// this triggers the evaluation
		const { observedCalls, observedSfus } = samples;

		const evaluatorContext: EvaluatorContext = {
			observedCalls,
			observedSfus,
			reports: this._reportsCollector,
			storages: this._storageProvider,
			joinedClientIds: [],
			detachedClients: [],
			startedCallIds: [],
			endedCalls: [],
			openedPeerConnectionIds: [],
			closedPeerConnections: [],
			addedInboundAudioTrackIds: [],
			removedInboundAudioTracks: [],
			addedInboundVideoTrackIds: [],
			removedInboundVideoTracks: [],
			addedOutboundAudioTrackIds: [],
			removedOutboundAudioTracks: [],
			addedOutboundVideoTrackIds: [],
			removedOutboundVideoTracks: [],
			joinedSfuIds: [],
			detachedSfus: [],
			openedSfuTransportIds: [],
			closedSfuTransports: [],
			addedSfuInbounRtpPadIds: [],
			removedSfuInbounRtpPadIds: [],
			addedSfuOutbounRtpPadIds: [],
			removedSfuOutbounRtpPadIds: [],
			openedSfuSctpChannelIds: [],
			closedSfuSctpChannels: [],
			
			clientExtensionStats: [],
			callEvents: [],
			sfuEvents: [],
			sfuExtensionStats: [],
		};

		const callOperations = createCallOperationContext(this._clientOperations, evaluatorContext);
		this._clientOperations.clear();

		this._eval(callOperations, evaluatorContext)
			.then(() => {
				logger.debug(`Evaluator is successfully performed eval process`);
			})
			.catch((err) => {
				logger.warn(`Error occurred while evaluating`, err);
			})
			.finally(() => {
				this._emit('ready', undefined);
			});
	}

	private async _eval(callOperationsContext: CallOperationsContext, evaluatorContext: EvaluatorContext): Promise<void> {
		const actualBlockingPoint = this._evaluations.get(this._index) ?? Promise.resolve();
		const index = ++this._index;
		const result = new Promise<void>((resolve, reject) => {
			actualBlockingPoint.then(() => {
				this._process(callOperationsContext, evaluatorContext)
					.then(() => resolve())
					.catch((err) => reject(err));
			});
		});
		const nextBlockingPoint = new Promise<void>((resolve) => {
			result.then(() => {
				this._evaluations.delete(index);
				resolve();
			}).catch(() => {
				this._evaluations.delete(index);
				resolve();
			});
		});
		this._evaluations.set(index, nextBlockingPoint);
		return result;
	}

	public get ongoingProcess(): number {
		return this._evaluations.size;
	}

	private async _process(
		callOperationsContext: CallOperationsContext,
		evaluatorContext: EvaluatorContext
	): Promise<void> {
		await this._callSemaphore.acquire();
		await this._callProcessor.use(callOperationsContext).finally(() => {
			this._callSemaphore.release();
		});
		const transactionContext = await createTransactionContext(
			evaluatorContext,
			this._storageProvider,
			evaluatorContext.observedCalls,
			evaluatorContext.observedSfus,
		);

		await this._transactionProcessor.use(transactionContext);

		await this._customProcessor.use(evaluatorContext);

		this._emit('ready', undefined);
	}
}
