import { EventEmitter } from 'events';
import type { types } from 'mediasoup';
import {
	MediasoupRouterSample,
	MediasoupTransportSample,
	MediasoupProducerSample,
	MediasoupConsumerSample,
	MediasoupDataProducerSample,
	MediasoupDataConsumerSample,
	MediasoupWebRtcTransportSampleEventMap,
	MediasoupPlainTransportSampleEventMap,
	MediasoupPipeTransportSampleEventMap,
} from './schema/MediasoupRouter';
import { createLogger } from './common/logger';

const logger = createLogger('ObservedMediasoupRouter');

/**
 * Declarative enrichment: return the `attachments` to stamp onto an entity's sample the moment it is
 * created. Called once per entity, before the corresponding `*-sample-added` event.
 *
 * The mediasoup object is handed in, so the common case — mirroring mediasoup's own `appData`, where
 * applications already keep `participantId`, `purpose` and friends — is a one-liner. Returning
 * `undefined` attaches nothing.
 */
export type MediasoupSampleEnricher = {
	transport?: (transport: types.Transport) => Record<string, unknown> | undefined;
	producer?: (producer: types.Producer, transport: types.Transport) => Record<string, unknown> | undefined;
	consumer?: (consumer: types.Consumer, transport: types.Transport) => Record<string, unknown> | undefined;
	dataProducer?: (dataProducer: types.DataProducer, transport: types.Transport) => Record<string, unknown> | undefined;
	dataConsumer?: (dataConsumer: types.DataConsumer, transport: types.Transport) => Record<string, unknown> | undefined;
};

export type ObservedMediasoupRouterSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	router: types.Router,
	appData?: AppData;
	attachments?: Record<string, unknown>,

	/** Stamp `attachments` onto each entity sample as it is created. See {@link MediasoupSampleEnricher}. */
	enrich?: MediasoupSampleEnricher,
};

/**
 * Lifecycle hooks for building your own report.
 *
 * Each entity announces itself as `<entity>-sample-added` when it appears and
 * `<entity>-sample-closed` when it goes away, carrying **the live sample object** plus the mediasoup
 * object it came from. Mutating `sample.attachments` inside a handler is the intended way to extend
 * a sample on the fly — the object you receive is the one held in `observedRouter.sample`, not a copy.
 */
export type ObservedMediasoupRouterEvents = {
	close: [];

	'transport-sample-added': [{ sample: MediasoupTransportSample, transport: types.Transport }];
	'transport-sample-closed': [{ sample: MediasoupTransportSample, transport: types.Transport }];

	'producer-sample-added': [{ sample: MediasoupProducerSample, producer: types.Producer, transport: types.Transport }];
	'producer-sample-closed': [{ sample: MediasoupProducerSample, producer: types.Producer, transport: types.Transport }];

	'consumer-sample-added': [{ sample: MediasoupConsumerSample, consumer: types.Consumer, transport: types.Transport }];
	'consumer-sample-closed': [{ sample: MediasoupConsumerSample, consumer: types.Consumer, transport: types.Transport }];

	'data-producer-sample-added': [{ sample: MediasoupDataProducerSample, dataProducer: types.DataProducer, transport: types.Transport }];
	'data-producer-sample-closed': [{ sample: MediasoupDataProducerSample, dataProducer: types.DataProducer, transport: types.Transport }];

	'data-consumer-sample-added': [{ sample: MediasoupDataConsumerSample, dataConsumer: types.DataConsumer, transport: types.Transport }];
	'data-consumer-sample-closed': [{ sample: MediasoupDataConsumerSample, dataConsumer: types.DataConsumer, transport: types.Transport }];
};

export declare interface ObservedMediasoupRouter {
	on<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	off<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	once<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	emit<U extends keyof ObservedMediasoupRouterEvents>(event: U, ...args: ObservedMediasoupRouterEvents[U]): boolean;
}

/**
 * Observes a live mediasoup `Router` by subscribing to its `observer` API and **accumulates** its
 * topology and lifecycle into an in-memory `MediasoupRouterSample` (`observedRouter.sample`):
 * transports, producers, consumers, data producers/consumers, their state-change history and
 * `createdAt` / `closedAt`. The sample grows for the life of the router (closed entities are kept,
 * with their `closedAt` set) and is yours to read, snapshot, or persist.
 *
 * NOTE: this is intentionally the simplest approach — everything is held in memory. For very large
 * routers (e.g. ~100 participants producing and consuming on one router, where consumers grow as
 * O(N²)) this can become substantial; in that case do your own periodic sampling/persistence and
 * discard what you don't need (see the README's "Memory & large meetings" note).
 */
export class ObservedMediasoupRouter<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly router: types.Router;
	public appData: AppData;
	public readonly sample: MediasoupRouterSample;

	public readonly webrtcTransportIds = new Set<string>();
	public closed = false;

	// Id -> sample indexes over the arrays in `this.sample`, so an entity can be reached in O(1)
	// instead of scanning (`sample.producers.find(...)`). They hold the *same* objects as the arrays.
	private readonly _transportSamples = new Map<string, MediasoupTransportSample>();
	private readonly _producerSamples = new Map<string, MediasoupProducerSample>();
	private readonly _consumerSamples = new Map<string, MediasoupConsumerSample>();
	private readonly _dataProducerSamples = new Map<string, MediasoupDataProducerSample>();
	private readonly _dataConsumerSamples = new Map<string, MediasoupDataConsumerSample>();
	private readonly _enrich?: MediasoupSampleEnricher;

	public constructor(
		settings: ObservedMediasoupRouterSettings<AppData>,
	) {
		super();

		this.router = settings.router;
		this.appData = (settings.appData ?? {}) as AppData;
		this._enrich = settings.enrich;
		this.sample = {
			routerId: this.router.id,
			attachments: settings.attachments ?? {},
			createdAt: Date.now(),
			producers: [],
			consumers: [],
			dataProducers: [],
			dataConsumers: [],
			transports: [],
		};

		this.attachRouterListeners();
	}

	public get id() {
		return this.router.id;
	}

	public get attachments() {
		return this.sample.attachments;
	}

	/* ---------------------------------------------------------------------------------------------
	 * Reaching individual entity samples.
	 *
	 * `sample.producers` (and friends) are arrays because that is the shape you want to serialize.
	 * These accessors index the same objects by id, so annotating one entity is an O(1) lookup and a
	 * mutation, rather than a scan that silently does nothing when the id is wrong.
	 * ------------------------------------------------------------------------------------------- */

	public getTransportSample(id: string) {
		return this._transportSamples.get(id);
	}

	public getProducerSample(id: string) {
		return this._producerSamples.get(id);
	}

	public getConsumerSample(id: string) {
		return this._consumerSamples.get(id);
	}

	public getDataProducerSample(id: string) {
		return this._dataProducerSamples.get(id);
	}

	public getDataConsumerSample(id: string) {
		return this._dataConsumerSamples.get(id);
	}

	/**
	 * Merge `attachments` into an entity's sample, whichever kind it is.
	 *
	 * Ids are unique across mediasoup entity kinds, so one method covers all of them. Returns `false`
	 * when the id is unknown — a real answer instead of failing quietly, which matters when the
	 * annotation is driven by application events that may race the mediasoup ones.
	 */
	public attachTo(id: string, attachments: Record<string, unknown>): boolean {
		const sample = this._transportSamples.get(id)
			?? this._producerSamples.get(id)
			?? this._consumerSamples.get(id)
			?? this._dataProducerSamples.get(id)
			?? this._dataConsumerSamples.get(id);

		if (!sample) return false;

		sample.attachments = { ...sample.attachments, ...attachments };

		return true;
	}

	/**
	 * A **detached deep copy** of the current sample — the basis for building your own report.
	 *
	 * `this.sample` is live: its arrays grow and its `history` entries are appended as the router
	 * runs, so a report built directly on it keeps changing after you think you're done. This returns
	 * a snapshot that never moves.
	 */
	public snapshot(): MediasoupRouterSample {
		// `structuredClone` is a global that isn't guaranteed everywhere the library runs (older
		// runtimes, some test environments), so fall back to a JSON round-trip. The sample is plain
		// serializable data by construction, which is exactly what a report needs anyway.
		if (typeof structuredClone === 'function') return structuredClone(this.sample);

		return JSON.parse(JSON.stringify(this.sample)) as MediasoupRouterSample;
	}

	public close() {
		if (this.closed) return;

		this.closed = true;
		if (this.sample.closedAt === undefined) this.sample.closedAt = Date.now();

		this.emit('close');
	}

	public addTransport = (transport: types.Transport) => {
		let transportType = transport.type;

		// for backward compatibility
		if (!transportType) {
			if (transport.constructor.name === 'WebRtcTransport') transportType = 'webrtc';
			else if (transport.constructor.name === 'PlainTransport') transportType = 'plain';
			else if (transport.constructor.name === 'PipeTransport') transportType = 'pipe';
			else if (transport.constructor.name === 'DirectTransport') transportType = 'direct';
		}

		if (!transportType) return logger.warn(`Unknown transport type for transport ${transport.id}: ${transport.constructor.name}`);

		switch (transportType) {
			case 'webrtc':
				return this.addWebRtcTransport(transport as types.WebRtcTransport);
			case 'plain':
				return this.addPlainTransport(transport as types.PlainTransport);
			case 'pipe':
				return this.addPipeTransport(transport as types.PipeTransport);
			case 'direct':
				return this.addDirectTransport(transport as types.DirectTransport);
			default:
				return logger.warn(`Unsupported transport type for transport ${transport.id}: ${transportType}`);
		}
	};

	public addWebRtcTransport(transport: types.WebRtcTransport) {
		const history: MediasoupWebRtcTransportSampleEventMap[] = [];
		const transportSample: MediasoupTransportSample = {
			id: transport.id, type: 'webrtc', createdAt: Date.now(), tuple: transport.iceSelectedTuple, history,
		};

		this._addTransportSample(transportSample, transport);
		this.webrtcTransportIds.add(transport.id);

		const onIceStateChange = (iceState: types.IceState) =>
			history.push({ type: `icestate-changed-to-${iceState}`, timestamp: Date.now() } as MediasoupWebRtcTransportSampleEventMap);
		const onIceSelectedTupleChange = (tuple: types.TransportTuple) => {
			transportSample.tuple = tuple;
			history.push({ type: 'iceselectedtuple-changed', timestamp: Date.now(), ...tuple });
		};
		const onDtlsStateChange = (dtlsState: types.DtlsState) => {
			history.push({ type: `dtlsstate-changed-to-${dtlsState}`, timestamp: Date.now() } as MediasoupWebRtcTransportSampleEventMap);
			if (dtlsState === 'connected' && transportSample.connectedAt === undefined) transportSample.connectedAt = Date.now();
		};
		const onSctpStateChange = (sctpState: types.SctpState) =>
			history.push({ type: `sctpstate-changed-to-${sctpState}`, timestamp: Date.now() } as MediasoupWebRtcTransportSampleEventMap);

		this._attachTransportObserverListeners(transport, transportSample, () => {
			transport.observer.off('icestatechange', onIceStateChange);
			transport.observer.off('iceselectedtuplechange', onIceSelectedTupleChange);
			transport.observer.off('dtlsstatechange', onDtlsStateChange);
			transport.observer.off('sctpstatechange', onSctpStateChange);

			this.webrtcTransportIds.delete(transport.id);
		});

		transport.observer.on('icestatechange', onIceStateChange);
		transport.observer.on('iceselectedtuplechange', onIceSelectedTupleChange);
		transport.observer.on('dtlsstatechange', onDtlsStateChange);
		transport.observer.on('sctpstatechange', onSctpStateChange);
	}

	public addPlainTransport(transport: types.PlainTransport) {
		const history: MediasoupPlainTransportSampleEventMap[] = [];
		const transportSample: MediasoupTransportSample = {
			id: transport.id, type: 'plain', createdAt: Date.now(), tuple: transport.tuple, rtcpTuple: transport.rtcpTuple, history,
		};

		this._addTransportSample(transportSample, transport);

		const onTuple = (tuple: types.TransportTuple) => {
			transportSample.tuple = tuple;
			if (transportSample.connectedAt === undefined) transportSample.connectedAt = Date.now();
			history.push({ type: 'tuple-changed', timestamp: Date.now(), ...tuple });
		};
		const onRtcpTuple = (rtcpTuple: types.TransportTuple) => {
			transportSample.rtcpTuple = rtcpTuple;
			history.push({ type: 'rtcptuple-changed', timestamp: Date.now(), ...rtcpTuple });
		};
		const onSctpStateChange = (sctpState: types.SctpState) => {
			if (sctpState === 'connected' && transportSample.connectedAt === undefined) transportSample.connectedAt = Date.now();
			history.push({ type: `sctpstate-changed-to-${sctpState}`, timestamp: Date.now() } as MediasoupPlainTransportSampleEventMap);
		};

		this._attachTransportObserverListeners(transport, transportSample, () => {
			transport.observer.off('tuple', onTuple);
			transport.observer.off('rtcptuple', onRtcpTuple);
			transport.observer.off('sctpstatechange', onSctpStateChange);
		});

		transport.observer.on('tuple', onTuple);
		transport.observer.on('rtcptuple', onRtcpTuple);
		transport.observer.on('sctpstatechange', onSctpStateChange);
	}

	public addPipeTransport(transport: types.PipeTransport) {
		const history: MediasoupPipeTransportSampleEventMap[] = [];
		const transportSample: MediasoupTransportSample = {
			id: transport.id, type: 'pipe', createdAt: Date.now(), tuple: transport.tuple, history,
		};

		this._addTransportSample(transportSample, transport);

		const onSctpStateChange = (sctpState: types.SctpState) => {
			if (sctpState === 'connected' && transportSample.connectedAt === undefined) transportSample.connectedAt = Date.now();
			history.push({ type: `sctpstate-changed-to-${sctpState}`, timestamp: Date.now() } as MediasoupPipeTransportSampleEventMap);
		};

		this._attachTransportObserverListeners(transport, transportSample, () => {
			transport.observer.off('sctpstatechange', onSctpStateChange);
		});

		transport.observer.on('sctpstatechange', onSctpStateChange);
	}

	public addDirectTransport(transport: types.DirectTransport) {
		const now = Date.now();
		const transportSample: MediasoupTransportSample = {
			id: transport.id, type: 'direct', createdAt: now, connectedAt: now, history: [],
		};

		this._addTransportSample(transportSample, transport);

		this._attachTransportObserverListeners(transport, transportSample);
	}

	public addProducer(transport: types.Transport, producer: types.Producer) {
		const firstCodec = producer.rtpParameters.codecs[0];
		const producerSample: MediasoupProducerSample = {
			id: producer.id,
			transportId: transport.id,
			createdAt: Date.now(),
			kind: producer.kind,
			codecInfo: {
				mimeType: firstCodec?.mimeType ?? 'unknown/unknown',
				payloadType: firstCodec?.payloadType ?? 0,
				clockRate: firstCodec?.clockRate ?? 0,
				channels: firstCodec?.channels,
				parameters: firstCodec?.parameters,
				rtcpFeedback: firstCodec?.rtcpFeedback,
			},
			ssrcs: producer.rtpParameters.encodings?.map((e) => e.ssrc).filter((s): s is number => typeof s === 'number'),
			rids: producer.rtpParameters.encodings?.map((e) => e.rid).filter((r): r is string => typeof r === 'string'),
			history: [],
		};

		this._addProducerSample(producerSample, producer, transport);

		const onPause = () => producerSample.history.push({ type: 'pause', timestamp: Date.now() });
		const onResume = () => producerSample.history.push({ type: 'resume', timestamp: Date.now() });

		producer.observer.once('close', () => {
			producer.observer.off('pause', onPause);
			producer.observer.off('resume', onResume);
			producerSample.closedAt = Date.now();
			this.emit('producer-sample-closed', { sample: producerSample, producer, transport });
		});
		producer.observer.on('pause', onPause);
		producer.observer.on('resume', onResume);
	}

	public addConsumer(transport: types.Transport, consumer: types.Consumer) {
		const consumerSample: MediasoupConsumerSample = {
			id: consumer.id,
			producerId: consumer.producerId,
			transportId: transport.id,
			createdAt: Date.now(),
			kind: consumer.kind,
			history: [],
		};

		this._addConsumerSample(consumerSample, consumer, transport);

		const onPause = () => consumerSample.history.push({ type: 'pause', timestamp: Date.now() });
		const onResume = () => consumerSample.history.push({ type: 'resume', timestamp: Date.now() });
		const onProducerPause = () => consumerSample.history.push({ type: 'producerPaused', timestamp: Date.now() });
		const onProducerResume = () => consumerSample.history.push({ type: 'producerResumed', timestamp: Date.now() });

		consumer.observer.once('close', () => {
			consumer.observer.off('pause', onPause);
			consumer.observer.off('resume', onResume);
			consumer.off('producerresume', onProducerResume);
			consumer.off('producerpause', onProducerPause);
			consumerSample.closedAt = Date.now();
			this.emit('consumer-sample-closed', { sample: consumerSample, consumer, transport });
		});

		consumer.observer.on('pause', onPause);
		consumer.observer.on('resume', onResume);
		consumer.on('producerpause', onProducerPause);
		consumer.on('producerresume', onProducerResume);
	}

	public addDataProducer(transport: types.Transport, dataProducer: types.DataProducer) {
		const dataProducerSample: MediasoupDataProducerSample = {
			id: dataProducer.id,
			transportId: transport.id,
			createdAt: Date.now(),
			label: dataProducer.label,
			protocol: dataProducer.protocol,
		};

		this._addDataProducerSample(dataProducerSample, dataProducer, transport);

		dataProducer.observer.once('close', () => {
			dataProducerSample.closedAt = Date.now();
			this.emit('data-producer-sample-closed', { sample: dataProducerSample, dataProducer, transport });
		});
	}

	public addDataConsumer(transport: types.Transport, dataConsumer: types.DataConsumer) {
		const dataConsumerSample: MediasoupDataConsumerSample = {
			id: dataConsumer.id,
			dataProducerId: dataConsumer.dataProducerId,
			transportId: transport.id,
			createdAt: Date.now(),
			label: dataConsumer.label,
			protocol: dataConsumer.protocol,
		};

		this._addDataConsumerSample(dataConsumerSample, dataConsumer, transport);

		dataConsumer.observer.once('close', () => {
			dataConsumerSample.closedAt = Date.now();
			this.emit('data-consumer-sample-closed', { sample: dataConsumerSample, dataConsumer, transport });
		});
	}

	private attachRouterListeners() {
		this.router.observer.once('close', () => {
			this.router.observer.off('newtransport', this.addTransport);

			this.sample.closedAt = Date.now();
			this.close();
		});
		this.router.observer.on('newtransport', this.addTransport);
	}

	/* ---------------------------------------------------------------------------------------------
	 * Registration: push into the sample array, index by id, run the enricher, announce.
	 * The order matters — enrichment lands *before* the event, so a listener always sees the
	 * declaratively-attached data and can build on it rather than race it.
	 * ------------------------------------------------------------------------------------------- */

	private _addTransportSample(sample: MediasoupTransportSample, transport: types.Transport) {
		this.sample.transports.push(sample);
		this._transportSamples.set(sample.id, sample);
		this._applyEnrichment(sample, this._enrich?.transport && (() => this._enrich?.transport?.(transport)));
		this.emit('transport-sample-added', { sample, transport });
	}

	private _addProducerSample(sample: MediasoupProducerSample, producer: types.Producer, transport: types.Transport) {
		this.sample.producers.push(sample);
		this._producerSamples.set(sample.id, sample);
		this._applyEnrichment(sample, this._enrich?.producer && (() => this._enrich?.producer?.(producer, transport)));
		this.emit('producer-sample-added', { sample, producer, transport });
	}

	private _addConsumerSample(sample: MediasoupConsumerSample, consumer: types.Consumer, transport: types.Transport) {
		this.sample.consumers.push(sample);
		this._consumerSamples.set(sample.id, sample);
		this._applyEnrichment(sample, this._enrich?.consumer && (() => this._enrich?.consumer?.(consumer, transport)));
		this.emit('consumer-sample-added', { sample, consumer, transport });
	}

	private _addDataProducerSample(sample: MediasoupDataProducerSample, dataProducer: types.DataProducer, transport: types.Transport) {
		this.sample.dataProducers.push(sample);
		this._dataProducerSamples.set(sample.id, sample);
		this._applyEnrichment(sample, this._enrich?.dataProducer && (() => this._enrich?.dataProducer?.(dataProducer, transport)));
		this.emit('data-producer-sample-added', { sample, dataProducer, transport });
	}

	private _addDataConsumerSample(sample: MediasoupDataConsumerSample, dataConsumer: types.DataConsumer, transport: types.Transport) {
		this.sample.dataConsumers.push(sample);
		this._dataConsumerSamples.set(sample.id, sample);
		this._applyEnrichment(sample, this._enrich?.dataConsumer && (() => this._enrich?.dataConsumer?.(dataConsumer, transport)));
		this.emit('data-consumer-sample-added', { sample, dataConsumer, transport });
	}

	/**
	 * Run an enricher and merge what it returns.
	 *
	 * Takes a thunk rather than a value so the **invocation** is inside the guard — application code
	 * runs here, and a throwing enricher must not take the router's bookkeeping down with it.
	 */
	private _applyEnrichment(
		sample: { attachments?: Record<string, unknown> },
		enrich?: () => Record<string, unknown> | undefined,
	) {
		if (!enrich) return;

		try {
			const attachments = enrich();

			if (attachments) sample.attachments = { ...sample.attachments, ...attachments };
		} catch (err) {
			logger.warn('Mediasoup sample enricher threw for router %s: %o', this.id, err);
		}
	}

	private _attachTransportObserverListeners(
		transport: types.Transport,
		transportSample: MediasoupTransportSample,
		onClose?: () => void,
	) {
		const onNewProducer = (producer: types.Producer) => this.addProducer(transport, producer);
		const onNewConsumer = (consumer: types.Consumer) => this.addConsumer(transport, consumer);
		const onNewDataProducer = (dataProducer: types.DataProducer) => this.addDataProducer(transport, dataProducer);
		const onNewDataConsumer = (dataConsumer: types.DataConsumer) => this.addDataConsumer(transport, dataConsumer);

		transport.observer.once('close', () => {
			transport.observer.off('newproducer', onNewProducer);
			transport.observer.off('newconsumer', onNewConsumer);
			transport.observer.off('newdataproducer', onNewDataProducer);
			transport.observer.off('newdataconsumer', onNewDataConsumer);

			onClose?.();

			transportSample.closedAt = Date.now();
			this.emit('transport-sample-closed', { sample: transportSample, transport });
		});

		transport.observer.on('newproducer', onNewProducer);
		transport.observer.on('newconsumer', onNewConsumer);
		transport.observer.on('newdataproducer', onNewDataProducer);
		transport.observer.on('newdataconsumer', onNewDataConsumer);
	}
}
