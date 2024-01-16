import { ObserverReportsEmitter, ObserverSinkProcess, SinkConfig, SinkImpl } from './sinks/ObserverSink';
import { Sources, SourcesConfig } from './sources/Sources';
import { createSimpleStorageProvider, StorageProvider } from './storages/StorageProvider';
import { Evaluator, EvaluatorConfig, EvaluatorProcess } from './Evaluator';
import { createSimpleSemaphoreProvider, SemaphoreProvider } from './common/Semaphore';
import { ObservedCallSourceConfig, ObservedCallSource } from './sources/ObservedCallSource';
import { PartialBy, asyncIteratorConverter } from './common/utils';
import { createLogger, LogLevel } from './common/logger';
import { ObservedSfuSource, ObservedSfuSourceConfig } from './sources/ObservedSfuSource';
import { EventEmitter } from 'events';
import { CallEntry, createCallEntry } from './entries/CallEntry';
import { ClientEntry, createClientEntry } from './entries/ClientEntry';
import { PeerConnectionEntry, createPeerConnectionEntry } from './entries/PeerConnectionEntry';
import { InboundTrackEntry, createInboundTrackEntry } from './entries/InboundTrackEntry';
import { OutboundTrackEntry, createOutboundTrackEntry } from './entries/OutboundTrackEntry';
import { SfuEntry, createSfuEntry } from './entries/SfuEntry';
import { SfuTransportEntry, createSfuTransportEntry } from './entries/SfuTransportEntry';
import { SfuInboundRtpPadEntry, createSfuInboundRtpPadEntry } from './entries/SfuInboundRtpPadEntry';
import { SfuOutboundRtpPadEntry, createSfuOutboundRtpPadEntry } from './entries/SfuOutboundRtpPadEntry';
import { SfuSctpChannelEntry, createSfuSctpChannelEntry } from './entries/SfuSctpChannelEntry';
import { GetClientCoordinate, createSetClientsCoordinateEvaluator } from './evaluators/SetClientsCoordinateEvaluator';

const logger = createLogger('Observer');

export type ObserverEvents = {
	'processing-started': undefined,
	'client-added': string,
	'client-removed': string,
	'processing-ended': undefined,
	'close': undefined,
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

	/**
	 * Setup the sources
	 */
	sources: SourcesConfig;
	evaluator: EvaluatorConfig;
	sink: SinkConfig;
	storages?: StorageProvider;
	semaphores?: SemaphoreProvider;

	logLevel: LogLevel;
};

export class Observer {
	public static create(providedConfig: Partial<ObserverConfig>): Observer {
		const config: ObserverConfig = Object.assign(
			{
				defaultServiceId: 'default-service-id',
				defaultMediaUnitId: 'default-media-unit-id',
				sources: {
					maxSamples: 1000,
					maxTimeInMs: 10000,
				},
				evaluator: {
					fetchSamples: true,
					maxIdleTimeInMs: 300 * 1000,
				},
				sink: {},
				logLevel: 'info',
			},
			providedConfig
		);

		const semaphores = providedConfig.semaphores ?? createSimpleSemaphoreProvider();
		const storages = providedConfig.storages ?? createSimpleStorageProvider();
		
		return new Observer(config, storages, semaphores);
	}

	private readonly _emitter = new EventEmitter();
	private _sources: Sources;
	private _sink: SinkImpl;
	private _evaluator: Evaluator;
	private _closed = false;
	public constructor(
		public readonly config: ObserverConfig,
		private readonly _storages: StorageProvider,
		private readonly _semaphores: SemaphoreProvider
	) {
		this._sources = new Sources(config.sources);
		this._sink = new SinkImpl(config.sink);
		this._evaluator = new Evaluator(
			this.config.evaluator, 
			this._semaphores.callSemaphore, 
			this._storages, 
			this._sink
		);

		this._sources.on('observed-samples', (event) => {
			this._emitter.emit('processing-started');
			this._evaluator.addObservedSamples(event);
		});
		this._sources.on('added-client-source', (event) => {
			this._evaluator.addCreatedClientSource(event);
			this._emitter.emit('client-added', event.clientId);
		});
		this._sources.on('removed-client-source', (event) => {
			this._evaluator.addClosedClientSource(event);
			this._emitter.emit('client-added', event.clientId);
		});
		this._evaluator.on('ready', () => {
			this._sink.emit();
			this._emitter.emit('processing-ended');
		});
		logger.debug('Observer is created with config', this.config);
	}

	public get sources(): Sources {
		return this._sources;
	}

	public on<K extends keyof ObserverEvents>(event: K, listener: (arg: ObserverEvents[K]) => void): this {
		this._emitter.on(event, listener);
		
		return this;
	}

	public once<K extends keyof ObserverEvents>(event: K, listener: (arg: ObserverEvents[K]) => void): this {
		this._emitter.once(event, listener);
		
		return this;
	}

	public off<K extends keyof ObserverEvents>(event: K, listener: (arg: ObserverEvents[K]) => void): this {
		this._emitter.off(event, listener);
		
		return this;
	}

	public createCallSource<T extends Record<string, unknown> = Record<string, unknown>>(
		config: PartialBy<ObservedCallSourceConfig<T>, 'serviceId' | 'mediaUnitId' | 'appData'>
	): ObservedCallSource<T> {
		if (this._closed) {
			throw new Error('Attempted to create a call source on a closed observer');
		}

		const {
			serviceId = this.config.defaultServiceId,
			mediaUnitId = this.config.defaultMediaUnitId,
			appData = {} as T,
			...callConfig
		} = config;

		return this._sources.createCallSource({
			...callConfig,
			appData,
			mediaUnitId,
			serviceId,
		});
	}

	public createSfuSource<T extends Record<string, unknown> = Record<string, unknown>>(
		config: PartialBy<ObservedSfuSourceConfig<T>, 'serviceId' | 'mediaUnitId' | 'joined' | 'appData'>
	): ObservedSfuSource {
		if (this._closed) {
			throw new Error('Attempted to create a sfu source on a closed observer');
		}
		const {
			appData = {} as T,
			serviceId = this.config.defaultServiceId,
			mediaUnitId = this.config.defaultMediaUnitId,
			joined = Date.now(),
			...sfuConfig
		} = config;
		
		return this._sources.createSfuSource<T>({
			...sfuConfig,
			appData,
			serviceId,
			mediaUnitId,
			joined,
		});
	}

	public async evaluate() {
		return new Promise<void>((resolve, reject) => {
			this._evaluator.once('ready', (err) => {
				if (err) reject(err);
				else resolve();
			});
			this._sources.emitSamples();
		});
	}

	public get reports(): ObserverReportsEmitter {
		return this._sink;
	}

	public addEvaluators(...processes: EvaluatorProcess[]) {
		if (this._closed) {
			throw new Error('Attempted to add an evaluator to a closed observer');
		}
		for (const process of processes) {
			this._evaluator.addProcess(process);
		}
	}

	public removeEvaluators(...processes: EvaluatorProcess[]) {
		if (this._closed) {
			throw new Error('Attempted to remove an evaluator from a closed observer');
		}
		for (const process of processes) {
			this._evaluator.removeProcess(process);
		}
	}

	public addCoordinateEvaluator(getClientCoordinate: GetClientCoordinate) {
		if (this._closed) {
			throw new Error('Attempted to add an evaluator to a closed observer');
		}
		const process = createSetClientsCoordinateEvaluator(getClientCoordinate);

		this._evaluator.addProcess(async (context) => process(context));
	}

	public addSinks(...processes: ObserverSinkProcess[]) {
		if (this._closed) {
			throw new Error('Attempted to add an evaluator to a closed observer');
		}
		for (const process of processes) {
			this._sink.addProcess(process);
		}
	}

	public removeSinks(...processes: ObserverSinkProcess[]) {
		if (this._closed) {
			throw new Error('Attempted to remove an evaluator from a closed observer');
		}
		for (const process of processes) {
			this._sink.removeProcess(process);
		}
	}

	public calls(): AsyncIterableIterator<CallEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , callModel ] of storageProvider.callStorage[Symbol.asyncIterator]()) {
				if (!callModel) continue;
				yield createCallEntry(storageProvider, callModel);
			}
		})());
	}

	public sfus(): AsyncIterableIterator<SfuEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , sfuModel ] of storageProvider.sfuStorage[Symbol.asyncIterator]()) {
				if (!sfuModel) continue;
				yield createSfuEntry(storageProvider, sfuModel);
			}
		})());
	}

	public sfuTransports(): AsyncIterableIterator<SfuTransportEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , sfuTransportModel ] of storageProvider.sfuTransportStorage[Symbol.asyncIterator]()) {
				if (!sfuTransportModel) continue;
				yield createSfuTransportEntry(storageProvider, sfuTransportModel);
			}
		})());
	}

	public sfuInboundRtpPads(): AsyncIterableIterator<SfuInboundRtpPadEntry> {
		const storageProvider = this._storages;

		return asyncIteratorConverter((async function *() {
			for await (const [ , sfuInboundRtpPadModel ] of storageProvider.sfuInboundRtpPadStorage[Symbol.asyncIterator]()) {
				if (!sfuInboundRtpPadModel) continue;
				yield createSfuInboundRtpPadEntry(storageProvider, sfuInboundRtpPadModel);
			}
		})());
	}

	public sfuOutboundRtpPads(): AsyncIterableIterator<SfuOutboundRtpPadEntry> {
		const storageProvider = this._storages;

		return asyncIteratorConverter((async function *() {
			for await (const [ , sfuOutboundRtpPadModel ] of storageProvider.sfuOutboundRtpPadStorage[Symbol.asyncIterator]()) {
				if (!sfuOutboundRtpPadModel) continue;
				yield createSfuOutboundRtpPadEntry(storageProvider, sfuOutboundRtpPadModel);
			}
		})());
	}

	public clients(): AsyncIterableIterator<ClientEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , callModel ] of storageProvider.clientStorage[Symbol.asyncIterator]()) {
				if (!callModel) continue;
				yield createClientEntry(storageProvider, callModel);
			}
		})());
	}

	public peerConnections(): AsyncIterableIterator<PeerConnectionEntry> {
		const storageProvider = this._storages;

		return asyncIteratorConverter((async function *() {
			for await (const [ , peerConnectionModel ] of storageProvider.peerConnectionStorage[Symbol.asyncIterator]()) {
				if (!peerConnectionModel) continue;
				yield createPeerConnectionEntry(storageProvider, peerConnectionModel);
			}
		})());
	}

	public async getTrack(trackId: string) {
		const { inboundTrackStorage, outboundTrackStorage } = this._storages;
		const [ inbTrackModel, outbTrackModel ] = await Promise.all([
			inboundTrackStorage.get(trackId),
			outboundTrackStorage.get(trackId),
		]);

		if (inbTrackModel) return createInboundTrackEntry(this._storages, inbTrackModel);
		else if (outbTrackModel) return createOutboundTrackEntry(this._storages, outbTrackModel);
	}

	public async getAllTracks(trackIds: Iterable<string>) {
		const storageProvider = this._storages;
		const { inboundTrackStorage, outboundTrackStorage } = this._storages;
		
		const [ inbTrackModels, outbTrackModels ] = await Promise.all([
			inboundTrackStorage.getAll(trackIds),
			outboundTrackStorage.getAll(trackIds),
		]);

		const result = new Map<string, InboundTrackEntry | OutboundTrackEntry>();

		for (const [ trackId, model ] of inbTrackModels) {
			result.set(trackId, createInboundTrackEntry(storageProvider, model));
		}
		for (const [ trackId, model ] of outbTrackModels) {
			result.set(trackId, createOutboundTrackEntry(storageProvider, model));
		}

		return result;
	}

	public inboundTracks(): AsyncIterableIterator<InboundTrackEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , inboundTrackModel ] of storageProvider.inboundTrackStorage[Symbol.asyncIterator]()) {
				if (!inboundTrackModel) continue;
				yield createInboundTrackEntry(storageProvider, inboundTrackModel);
			}
		})());
	}

	public outboundTracks(): AsyncIterableIterator<OutboundTrackEntry> {
		const storageProvider = this._storages;
		
		return asyncIteratorConverter((async function *() {
			for await (const [ , outboundTrackModel ] of storageProvider.outboundTrackStorage[Symbol.asyncIterator]()) {
				if (!outboundTrackModel) continue;
				yield createOutboundTrackEntry(storageProvider, outboundTrackModel);
			}
		})());
	}

	public sfuSctpChannels(): AsyncIterableIterator<SfuSctpChannelEntry> {
		const storageProvider = this._storages;

		return asyncIteratorConverter((async function *() {
			for await (const [ , sfuSctpChannelModel ] of storageProvider.sfuSctpChannelStorage[Symbol.asyncIterator]()) {
				if (!sfuSctpChannelModel) continue;
				yield createSfuSctpChannelEntry(storageProvider, sfuSctpChannelModel);
			}
		})());
	}

	public async getCall(callId: string): Promise<CallEntry> {
		return createCallEntry(this._storages, await this._storages.callStorage.get(callId));
	}

	public async getAllCalls(callIds: Iterable<string>): Promise<ReadonlyMap<string, CallEntry>> {
		const models = await this._storages.callStorage.getAll(callIds);

		return new Map(Array.from(models).map(([ callId, model ]) => [ callId, createCallEntry(this._storages, model) ]));
	}

	public async getSfu(sfuId: string): Promise<SfuEntry> {
		return createSfuEntry(this._storages, await this._storages.sfuStorage.get(sfuId));
	}

	public async getAllSfus(sfuIds: Iterable<string>): Promise<ReadonlyMap<string, SfuEntry>> {
		const models = await this._storages.sfuStorage.getAll(sfuIds);

		return new Map(Array.from(models).map(([ sfuId, model ]) => [ sfuId, createSfuEntry(this._storages, model) ]));
	}

	public async getSfuTransport(sfuTransportId: string): Promise<SfuTransportEntry | undefined> {
		return createSfuTransportEntry(this._storages, await this._storages.sfuTransportStorage.get(sfuTransportId));
	}

	public async getAllSfuTransports(
		sfuTransportIds: Iterable<string>
	): Promise<ReadonlyMap<string, SfuTransportEntry>> {
		const models = await this._storages.sfuTransportStorage.getAll(sfuTransportIds);

		return new Map(Array.from(models).map(([ sfuTransportId, model ]) => [ sfuTransportId, createSfuTransportEntry(this._storages, model) ]));
	}

	public async getSfuInboundRtpPad(sfuInboundRtpPadId: string): Promise<SfuInboundRtpPadEntry | undefined> {
		return createSfuInboundRtpPadEntry(this._storages, await this._storages.sfuInboundRtpPadStorage.get(sfuInboundRtpPadId));
	}

	public async getAllSfuInboundRtpPads(
		sfuInboundRtpPadIds: Iterable<string>
	): Promise<ReadonlyMap<string, SfuInboundRtpPadEntry>> {
		const models = await this._storages.sfuInboundRtpPadStorage.getAll(sfuInboundRtpPadIds);

		return new Map(Array.from(models).map(([ sfuInboundRtpPadId, model ]) => [ sfuInboundRtpPadId, createSfuInboundRtpPadEntry(this._storages, model) ]));
	}

	public async getSfuOutboundRtpPad(sfuOutboundRtpPadId: string): Promise<SfuOutboundRtpPadEntry | undefined> {
		return createSfuOutboundRtpPadEntry(this._storages, await this._storages.sfuOutboundRtpPadStorage.get(sfuOutboundRtpPadId));
	}

	public async getAllSfuOutboundRtpPads(
		sfuOutboundRtpPadIds: Iterable<string>
	): Promise<ReadonlyMap<string, SfuOutboundRtpPadEntry>> {
		const models = await this._storages.sfuOutboundRtpPadStorage.getAll(sfuOutboundRtpPadIds);

		return new Map(Array.from(models).map(([ sfuOutboundRtpPadId, model ]) => [ sfuOutboundRtpPadId, createSfuOutboundRtpPadEntry(this._storages, model) ]));
	}

	public async getClient(clientId: string): Promise<ClientEntry> {
		return createClientEntry(this._storages, await this._storages.clientStorage.get(clientId));
	}

	public async getAllClient(clientIds: Iterable<string>): Promise<ReadonlyMap<string, ClientEntry>> {
		const models = await this._storages.clientStorage.getAll(clientIds);

		return new Map(Array.from(models).map(([ clientId, model ]) => [ clientId, createClientEntry(this._storages, model) ]));
	}

	public async getPeerConnection(peerConnectionId: string): Promise<PeerConnectionEntry> {
		return createPeerConnectionEntry(this._storages, await this._storages.peerConnectionStorage.get(peerConnectionId));
	}

	public async getAllPeerConnections(
		peerConnectionIds: Iterable<string>
	): Promise<ReadonlyMap<string, PeerConnectionEntry>> {
		const models = await this._storages.peerConnectionStorage.getAll(peerConnectionIds);

		return new Map(Array.from(models).map(([ peerConnectionId, model ]) => [ peerConnectionId, createPeerConnectionEntry(this._storages, model) ]));
	}

	public async getInboundTrack(inboundTrackId: string): Promise<InboundTrackEntry> {
		return createInboundTrackEntry(this._storages, await this._storages.inboundTrackStorage.get(inboundTrackId));
	}

	public async getAllInboundTracks(
		inboundTrackIds: Iterable<string>
	): Promise<ReadonlyMap<string, InboundTrackEntry>> {
		const models = await this._storages.inboundTrackStorage.getAll(inboundTrackIds);

		return new Map(Array.from(models).map(([ inboundTrackId, model ]) => [ inboundTrackId, createInboundTrackEntry(this._storages, model) ]));
	}

	public async getOutboundTrack(outboundTrackId: string): Promise<OutboundTrackEntry> {
		return createOutboundTrackEntry(this._storages, await this._storages.outboundTrackStorage.get(outboundTrackId));
	}

	public async getAllOutboundTracks(
		outboundTrackIds: Iterable<string>
	): Promise<ReadonlyMap<string, OutboundTrackEntry>> {
		const models = await this._storages.outboundTrackStorage.getAll(outboundTrackIds);

		return new Map(Array.from(models).map(([ outboundTrackId, model ]) => [ outboundTrackId, createOutboundTrackEntry(this._storages, model) ]));
	}

	public async getSfuSctpChannel(sctpChannelId: string): Promise<SfuSctpChannelEntry | undefined> {
		return createSfuSctpChannelEntry(this._storages, await this._storages.sfuSctpChannelStorage.get(sctpChannelId));
	}

	public async getAllSfuSctpChannel(
		sctpChannelIds: Iterable<string>
	): Promise<ReadonlyMap<string, SfuSctpChannelEntry>> {
		const models = await this._storages.sfuSctpChannelStorage.getAll(sctpChannelIds);

		return new Map(Array.from(models).map(([ sctpChannelId, model ]) => [ sctpChannelId, createSfuSctpChannelEntry(this._storages, model) ]));
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) {
			return logger.debug('Attempted to close twice');
		}
		this._closed = true;
		this._sources.close();
		
		this._emitter.emit('close');
	}
}
