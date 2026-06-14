import { EventEmitter } from 'events';
import type { types } from 'mediasoup';
import { MediasoupConsumerSample, MediasoupDataConsumerSample, MediasoupDataProducerSample, MediasoupProducerSample, MediasoupRouterSample, MediasoupTransportSample, MediasoupWebRtcTransportSampleEventMap, MediasoupPlainTransportSampleEventMap, MediasoupPipeTransportSampleEventMap } from './schema/MediasoupRouter';
import { createLogger } from './common/logger';

const logger = createLogger('ObservedMediasoupRouter');

export type ObservedMediasoupRouterSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	router: types.Router,
	appData?: AppData;
	attachments?: Record<string, unknown>,
};

export type ObservedMediasoupRouterEvents = {
	close: [];
};

export declare interface ObservedMediasoupRouter {
	on<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	off<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	once<U extends keyof ObservedMediasoupRouterEvents>(event: U, listener: (...args: ObservedMediasoupRouterEvents[U]) => void): this;
	emit<U extends keyof ObservedMediasoupRouterEvents>(event: U, ...args: ObservedMediasoupRouterEvents[U]): boolean;
}

export class ObservedMediasoupRouter<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly router: types.Router;
	public readonly sample: MediasoupRouterSample;
	public appData: AppData;

	public readonly webrtcTransportIds = new Set<string>;

	public get attachments() {
		return this.sample.attachments;
	}

	public closed = false;

	public constructor(
		settings: ObservedMediasoupRouterSettings<AppData>,
	) {
		super();

		this.router = settings.router;
		this.appData = (settings.appData ?? {}) as AppData;
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
			id: transport.id,
			type: 'webrtc',
			createdAt: Date.now(),
			tuple: transport.iceSelectedTuple,
			history,
		};

		this.sample.transports.push(transportSample);

		const onIceStateChange = (iceState: types.IceState) => {
			history.push({
				type: `icestate-changed-to-${iceState}`,
				timestamp: Date.now(),
			} as MediasoupWebRtcTransportSampleEventMap);
		};
		const onIceSelectedTupleChange = (tuple: types.TransportTuple) => {
			transportSample.tuple = tuple;
			history.push({
				type: 'iceselectedtuple-changed',
				timestamp: Date.now(),
				...tuple,
			});
		};
		const onDtlsStateChange = (dtlsState: types.DtlsState) => {
			history.push({
				type: `dtlsstate-changed-to-${dtlsState}`,
				timestamp: Date.now(),
			} as MediasoupWebRtcTransportSampleEventMap);

			// A WebRTC transport is "connected" once the DTLS handshake completes.
			if (dtlsState === 'connected' && transportSample.connectedAt === undefined) {
				transportSample.connectedAt = Date.now();
			}
		};
		const onSctpStateChange = (sctpState: types.SctpState) => {
			history.push({
				type: `sctpstate-changed-to-${sctpState}`,
				timestamp: Date.now(),
			} as MediasoupWebRtcTransportSampleEventMap);
		};

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

		this.webrtcTransportIds.add(transport.id);
	}

	public addPlainTransport(transport: types.PlainTransport) {
		const history: MediasoupPlainTransportSampleEventMap[] = [];
		const transportSample: MediasoupTransportSample = {
			id: transport.id,
			type: 'plain',
			createdAt: Date.now(),
			tuple: transport.tuple,
			rtcpTuple: transport.rtcpTuple,
			history,
		};

		this.sample.transports.push(transportSample);

		const onTuple = (tuple: types.TransportTuple) => {
			transportSample.tuple = tuple;
			// PlainTransport has no DTLS/ICE; the first detected RTP tuple is its "connected" moment.
			if (transportSample.connectedAt === undefined) transportSample.connectedAt = Date.now();
			history.push({ type: 'tuple-changed', timestamp: Date.now(), ...tuple });
		};
		const onRtcpTuple = (rtcpTuple: types.TransportTuple) => {
			transportSample.rtcpTuple = rtcpTuple;
			history.push({ type: 'rtcptuple-changed', timestamp: Date.now(), ...rtcpTuple });
		};
		const onSctpStateChange = (sctpState: types.SctpState) => {
			if (sctpState === 'connected' && transportSample.connectedAt === undefined) {
				transportSample.connectedAt = Date.now();
			}
			history.push({
				type: `sctpstate-changed-to-${sctpState}`,
				timestamp: Date.now(),
			} as MediasoupPlainTransportSampleEventMap);
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
			id: transport.id,
			type: 'pipe',
			createdAt: Date.now(),
			tuple: transport.tuple,
			history,
		};

		this.sample.transports.push(transportSample);

		const onSctpStateChange = (sctpState: types.SctpState) => {
			// A PipeTransport carries no ICE/DTLS; SCTP `'connected'` is the closest observable
			// "connected" signal (transports without SCTP simply leave `connectedAt` undefined).
			if (sctpState === 'connected' && transportSample.connectedAt === undefined) {
				transportSample.connectedAt = Date.now();
			}
			history.push({
				type: `sctpstate-changed-to-${sctpState}`,
				timestamp: Date.now(),
			} as MediasoupPipeTransportSampleEventMap);
		};

		this._attachTransportObserverListeners(transport, transportSample, () => {
			transport.observer.off('sctpstatechange', onSctpStateChange);
		});

		transport.observer.on('sctpstatechange', onSctpStateChange);
	}

	public addDirectTransport(transport: types.DirectTransport) {
		const now = Date.now();
		const transportSample: MediasoupTransportSample = {
			id: transport.id,
			type: 'direct',
			createdAt: now,
			// A DirectTransport has no network layer — it is connected the instant it exists.
			connectedAt: now,
			history: [],
		};

		this.sample.transports.push(transportSample);

		this._attachTransportObserverListeners(transport, transportSample);
	}

	public addProducer(transport: types.Transport, producer: types.Producer) {
		const firstCodec = producer.rtpParameters.codecs[0];
		const codecInfo = {
			mimeType: firstCodec?.mimeType ?? 'unknown/unknown',
			payloadType: firstCodec?.payloadType ?? 0,
			clockRate: firstCodec?.clockRate ?? 0,
			channels: firstCodec?.channels,
			parameters: firstCodec?.parameters,
			rtcpFeedback: firstCodec?.rtcpFeedback,
		};
		const producerSample: MediasoupProducerSample = {
			id: producer.id,
			createdAt: Date.now(),
			kind: producer.kind,
			codecInfo,
			ssrcs: producer.rtpParameters.encodings?.map((encoding) => encoding.ssrc).filter((ssrc): ssrc is number => typeof ssrc === 'number'),
			rids: producer.rtpParameters.encodings?.map((encoding) => encoding.rid).filter((rid): rid is string => typeof rid === 'string'),
			history: [],
			transportId: transport.id,
		};

		this.sample.producers.push(producerSample);

		const onPause = () => {
			producerSample.history.push({
				type: 'pause',
				timestamp: Date.now(),
			});
		};

		const onResume = () => {
			producerSample.history.push({
				type: 'resume',
				timestamp: Date.now(),
			});
		};

		producer.observer.once('close', () => {
			producer.observer.off('pause', onPause);
			producer.observer.off('resume', onResume);

			producerSample.closedAt = Date.now();
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

		this.sample.consumers.push(consumerSample);

		const onPause = () => {
			consumerSample.history.push({
				type: 'pause',
				timestamp: Date.now(),
			});
		};

		const onResume = () => {
			consumerSample.history.push({
				type: 'resume',
				timestamp: Date.now(),
			});
		};

		const onProducerPause = () => {
			consumerSample.history.push({
				type: 'producerPaused',
				timestamp: Date.now(),
			});
		};

		const onProducerResume = () => {
			consumerSample.history.push({
				type: 'producerResumed',
				timestamp: Date.now(),
			});
		};

		consumer.observer.once('close', () => {
			consumer.observer.off('pause', onPause);
			consumer.observer.off('resume', onResume);
			consumer.off('producerresume', onProducerResume);
			consumer.off('producerpause', onProducerPause);

			consumerSample.closedAt = Date.now();
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

		this.sample.dataProducers.push(dataProducerSample);

		dataProducer.observer.once('close', () => {
			dataProducerSample.closedAt = Date.now();
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

		this.sample.dataConsumers.push(dataConsumerSample);

		dataConsumer.observer.once('close', () => {
			dataConsumerSample.closedAt = Date.now();
		});
	}

	public close() {
		if (this.closed) return;

		this.closed = true;
		this.emit('close');
	}

	private attachRouterListeners() {
		this.router.observer.once('close', () => {
			this.router.observer.off('newtransport', this.addTransport);

			this.sample.closedAt = Date.now();
			this.close();
		});
		this.router.observer.on('newtransport', this.addTransport);
	}

	private _attachTransportObserverListeners(
		transport: types.Transport,
		transportSample: MediasoupTransportSample,
		onClose?: () => void,
	) {

		const onNewProducer = (producer: types.Producer) => {
			this.addProducer(transport, producer);
		};

		const onNewConsumer = (consumer: types.Consumer) => {
			this.addConsumer(transport, consumer);
		};

		const onNewDataProducer = (dataProducer: types.DataProducer) => {
			this.addDataProducer(transport, dataProducer);
		};

		const onNewDataConsumer = (dataConsumer: types.DataConsumer) => {
			this.addDataConsumer(transport, dataConsumer);
		};

		transport.observer.once('close', () => {
			transport.observer.off('newproducer', onNewProducer);
			transport.observer.off('newconsumer', onNewConsumer);
			transport.observer.off('newdataproducer', onNewDataProducer);
			transport.observer.off('newdataconsumer', onNewDataConsumer);

			onClose?.();

			transportSample.closedAt = Date.now();
		});

		transport.observer.on('newproducer', onNewProducer);
		transport.observer.on('newconsumer', onNewConsumer);
		transport.observer.on('newdataproducer', onNewDataProducer);
		transport.observer.on('newdataconsumer', onNewDataConsumer);
	}
}
