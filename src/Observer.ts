import { ObserverReportsEmitter, ObserverSinkProcess, SinkConfig, SinkImpl } from './sinks/ObserverSink';
import { Sources, SourcesConfig } from './sources/Sources';
import { createSimpleStorageProvider, StorageProvider } from './storages/StorageProvider';
import * as Models from './models/Models';
import { Evaluator, EvaluatorConfig, EvaluatorProcess } from './Evaluator';
import { createSimpleSemaphoreProvider, SemaphoreProvider } from './common/Semaphore';
import { ObservedCallSourceConfig, ObservedCallSource } from './sources/ObservedCallSource';
import { ObservedClientSource, ObservedClientSourceConfig } from './sources/ObservedClientSource';
import { PartialBy } from './common/utils';
import { createLogger, LogLevel } from './common/logger';
import { ObservedSfuSource, ObservedSfuSourceConfig } from './sources/ObservedSfuSource';

const logger = createLogger('Observer');

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
		this._evaluator = new Evaluator(this.config.evaluator, this._semaphores.callSemaphore, this._storages, this._sink);

		this._sources.on('observed-samples', (event) => {
			this._evaluator.addObservedSamples(event);
		});
		this._sources.on('added-client-source', (event) => {
			this._evaluator.addCreatedClientSource(event);
		});
		this._sources.on('removed-client-source', (event) => {
			this._evaluator.addClosedClientSource(event);
		});
		this._evaluator.on('ready', () => {
			this._sink.emit();
		});
		logger.debug(`Observer is created with config`, this.config);
	}

	public createCallSource(
		config: PartialBy<ObservedCallSourceConfig, 'serviceId' | 'mediaUnitId'>
	): ObservedCallSource {
		if (this._closed) {
			throw new Error(`Attempted to create a call source on a closed observer`);
		}
		let closed = false;
		const serviceId = config.serviceId ?? this.config.defaultServiceId;
		const mediaUnitId = config.mediaUnitId ?? this.config.defaultMediaUnitId;
		const clientSources = new Map<string, ObservedClientSource>();
		const callSource: ObservedCallSource = {
			...config,
			serviceId,
			mediaUnitId,
			createClientSource: (context) => {
				const clientSource = this._sources.createClientSource({
					...config,
					...context,
					serviceId,
					mediaUnitId,
				});
				const closeClientSource = clientSource.close;
				clientSource.close = () => {
					closeClientSource();
					clientSources.delete(context.clientId);
				};
				clientSources.set(context.clientId, clientSource);
				return clientSource;
			},
			close: () => {
				if (closed) {
					return;
				}
				for (const clientSource of clientSources.values()) {
					clientSource.close();
				}
				clientSources.clear();
				closed = true;
			},
			closed,
		};
		return callSource;
	}

	public createClientSource(
		config: PartialBy<ObservedClientSourceConfig, 'serviceId' | 'mediaUnitId' | 'joined'>
	): ObservedClientSource {
		if (this._closed) {
			throw new Error(`Attempted to create a client source on a closed observer`);
		}
		const serviceId = config.serviceId ?? this.config.defaultServiceId;
		const mediaUnitId = config.mediaUnitId ?? this.config.defaultMediaUnitId;
		const joined = config.joined ?? Date.now();
		return this._sources.createClientSource({
			...config,
			serviceId,
			mediaUnitId,
			joined,
		});
	}

	public createSfuSource(
		config: PartialBy<ObservedSfuSourceConfig, 'serviceId' | 'mediaUnitId' | 'joined'>
	): ObservedSfuSource {
		if (this._closed) {
			throw new Error(`Attempted to create a sfu source on a closed observer`);
		}
		const serviceId = config.serviceId ?? this.config.defaultServiceId;
		const mediaUnitId = config.mediaUnitId ?? this.config.defaultMediaUnitId;
		const joined = config.joined ?? Date.now();
		return this._sources.createSfuSource({
			...config,
			serviceId,
			mediaUnitId,
			joined,
		});
	}

	public get reports(): ObserverReportsEmitter {
		return this._sink;
	}

	public addEvaluators(...processes: EvaluatorProcess[]) {
		if (this._closed) {
			throw new Error(`Attempted to add an evaluator to a closed observer`);
		}
		for (const process of processes) {
			this._evaluator.addProcess(process);
		}
	}

	public removeEvaluators(...processes: EvaluatorProcess[]) {
		if (this._closed) {
			throw new Error(`Attempted to remove an evaluator from a closed observer`);
		}
		for (const process of processes) {
			this._evaluator.removeProcess(process);
		}
	}

	public addSinks(...processes: ObserverSinkProcess[]) {
		if (this._closed) {
			throw new Error(`Attempted to add an evaluator to a closed observer`);
		}
		for (const process of processes) {
			this._sink.addProcess(process);
		}
	}

	public removeSinks(...processes: ObserverSinkProcess[]) {
		if (this._closed) {
			throw new Error(`Attempted to remove an evaluator from a closed observer`);
		}
		for (const process of processes) {
			this._sink.removeProcess(process);
		}
	}

	public calls(): AsyncIterableIterator<[string, Models.Call]> {
		const { callStorage } = this._storages;
		return callStorage[Symbol.asyncIterator]();
	}

	public sfus(): AsyncIterableIterator<[string, Models.Sfu]> {
		const { sfuStorage } = this._storages;
		return sfuStorage[Symbol.asyncIterator]();
	}

	public sfuTransports(): AsyncIterableIterator<[string, Models.SfuTransport]> {
		const { sfuTransportStorage } = this._storages;
		return sfuTransportStorage[Symbol.asyncIterator]();
	}

	public sfuInboundRtpPads(): AsyncIterableIterator<[string, Models.SfuInboundRtpPad]> {
		const { sfuInboundRtpPadStorage } = this._storages;
		return sfuInboundRtpPadStorage[Symbol.asyncIterator]();
	}

	public sfuOutboundRtpPads(): AsyncIterableIterator<[string, Models.SfuOutboundRtpPad]> {
		const { sfuOutboundRtpPadStorage } = this._storages;
		return sfuOutboundRtpPadStorage[Symbol.asyncIterator]();
	}

	public clients(): AsyncIterableIterator<[string, Models.Client]> {
		const { clientStorage } = this._storages;
		return clientStorage[Symbol.asyncIterator]();
	}

	public peerConnections(): AsyncIterableIterator<[string, Models.PeerConnection]> {
		const { peerConnectionStorage } = this._storages;
		return peerConnectionStorage[Symbol.asyncIterator]();
	}

	public async getTrack(trackId: string) {
		const { inboundTrackStorage, outboundTrackStorage } = this._storages;
		const [inbTrack, outbTrack] = await Promise.all([
			inboundTrackStorage.get(trackId),
			outboundTrackStorage.get(trackId),
		]);
		if (inbTrack) return inbTrack;
		else if (outbTrack) return outbTrack;
	}

	public async getAllTracks(trackIds: Iterable<string>) {
		const { inboundTrackStorage, outboundTrackStorage } = this._storages;
		const [inbTracks, outbTracks] = await Promise.all([
			inboundTrackStorage.getAll(trackIds),
			outboundTrackStorage.getAll(trackIds),
		]);
		return new Map([...inbTracks, ...outbTracks]);
	}

	public inboundTracks(): AsyncIterableIterator<[string, Models.InboundTrack]> {
		const { inboundTrackStorage } = this._storages;
		return inboundTrackStorage[Symbol.asyncIterator]();
	}

	public outboundTracks(): AsyncIterableIterator<[string, Models.OutboundTrack]> {
		const { outboundTrackStorage } = this._storages;
		return outboundTrackStorage[Symbol.asyncIterator]();
	}

	public sfuSctpChannels(): AsyncIterableIterator<[string, Models.SfuSctpChannel]> {
		const { sfuSctpChannelStorage } = this._storages;
		return sfuSctpChannelStorage[Symbol.asyncIterator]();
	}

	public async getCall(callId: string): Promise<Models.Call | undefined> {
		const { callStorage } = this._storages;
		return callStorage.get(callId);
	}

	public async getAllCalls(callIds: Iterable<string>): Promise<ReadonlyMap<string, Models.Call>> {
		const { callStorage } = this._storages;
		return callStorage.getAll(callIds);
	}

	public async getSfu(sfuId: string): Promise<Models.Sfu | undefined> {
		const { sfuStorage } = this._storages;
		return sfuStorage.get(sfuId);
	}

	public async getAllSfus(sfuIds: Iterable<string>): Promise<ReadonlyMap<string, Models.Sfu>> {
		const { sfuStorage } = this._storages;
		return sfuStorage.getAll(sfuIds);
	}

	public async getSfuTransport(sfuTransportId: string): Promise<Models.SfuTransport | undefined> {
		const { sfuTransportStorage } = this._storages;
		return sfuTransportStorage.get(sfuTransportId);
	}

	public async getAllSfuTransports(
		sfuTransportIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.SfuTransport>> {
		const { sfuTransportStorage } = this._storages;
		return sfuTransportStorage.getAll(sfuTransportIds);
	}

	public async getSfuInboundRtpPad(sfuInboundRtpPadId: string): Promise<Models.SfuInboundRtpPad | undefined> {
		const { sfuInboundRtpPadStorage } = this._storages;
		return sfuInboundRtpPadStorage.get(sfuInboundRtpPadId);
	}

	public async getAllSfuInboundRtpPads(
		sfuInboundRtpPadIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.SfuInboundRtpPad>> {
		const { sfuInboundRtpPadStorage } = this._storages;
		return sfuInboundRtpPadStorage.getAll(sfuInboundRtpPadIds);
	}

	public async getSfuOutboundRtpPad(sfuOutboundRtpPadId: string): Promise<Models.SfuOutboundRtpPad | undefined> {
		const { sfuOutboundRtpPadStorage } = this._storages;
		return sfuOutboundRtpPadStorage.get(sfuOutboundRtpPadId);
	}

	public async getAllSfuOutboundRtpPads(
		sfuOutboundRtpPadIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.SfuOutboundRtpPad>> {
		const { sfuOutboundRtpPadStorage } = this._storages;
		return sfuOutboundRtpPadStorage.getAll(sfuOutboundRtpPadIds);
	}

	public async getClient(clientId: string): Promise<Models.Client | undefined> {
		const { clientStorage } = this._storages;
		return clientStorage.get(clientId);
	}

	public async getAllClient(clientIds: Iterable<string>): Promise<ReadonlyMap<string, Models.Client>> {
		const { clientStorage } = this._storages;
		return clientStorage.getAll(clientIds);
	}

	public async getPeerConnection(peerConnectionId: string): Promise<Models.PeerConnection | undefined> {
		const { peerConnectionStorage } = this._storages;
		return peerConnectionStorage.get(peerConnectionId);
	}

	public async getAllPeerConnections(
		peerConnectionIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.PeerConnection>> {
		const { peerConnectionStorage } = this._storages;
		return peerConnectionStorage.getAll(peerConnectionIds);
	}

	public async getInboundTrack(inboundTrackId: string): Promise<Models.InboundTrack | undefined> {
		const { inboundTrackStorage } = this._storages;
		return inboundTrackStorage.get(inboundTrackId);
	}

	public async getAllInboundTracks(
		inboundTrackIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.InboundTrack>> {
		const { inboundTrackStorage } = this._storages;
		return inboundTrackStorage.getAll(inboundTrackIds);
	}

	public async getOutboundTrack(outboundTrackId: string): Promise<Models.OutboundTrack | undefined> {
		const { outboundTrackStorage } = this._storages;
		return outboundTrackStorage.get(outboundTrackId);
	}

	public async getAllOutboundTracks(
		outboundTrackIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.OutboundTrack>> {
		const { outboundTrackStorage } = this._storages;
		return outboundTrackStorage.getAll(outboundTrackIds);
	}

	public async getSfuSctpChannel(sctpChannelId: string): Promise<Models.SfuSctpChannel | undefined> {
		const { sfuSctpChannelStorage } = this._storages;
		return sfuSctpChannelStorage.get(sctpChannelId);
	}

	public async getAllSfuSctpChannel(
		sctpChannelIds: Iterable<string>
	): Promise<ReadonlyMap<string, Models.SfuSctpChannel>> {
		const { sfuSctpChannelStorage } = this._storages;
		return sfuSctpChannelStorage.getAll(sctpChannelIds);
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) {
			logger.warn(`Attempted to close twice`);
			return;
		}
		this._sources.close();
		this._closed = true;
	}
}
