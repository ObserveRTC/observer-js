/** mediasoup `IceState`. */
export type IceState = 'new' | 'connected' | 'completed' | 'disconnected' | 'closed';

/** mediasoup `TransportTuple` (the selected local/remote address pair of a transport). */
export type TransportTuple = {
	localAddress: string;
	localPort: number;
	remoteIp?: string;
	remotePort?: number;
	protocol: 'udp' | 'tcp';
};

/** mediasoup `RtpCodecParameters` (the negotiated codec of a producer/consumer). */
export type RtpCodecParameters = {
	mimeType: string;
	payloadType: number;
	clockRate: number;
	channels?: number;
	parameters?: Record<string, unknown>;
	rtcpFeedback?: { type: string; parameter?: string }[];
};

type SampleHistoryItem<T extends string> = Record<string, unknown> & {
	type: T,
	timestamp: number;
}

/* -------------------------------------------------------------------------- */
/* Sample types                                                                */
/* -------------------------------------------------------------------------- */

export type MediasoupRouterSample = Record<string, unknown> & {
	routerId: string;
	attachments: Record<string, unknown>;
	createdAt: number;
	closedAt?: number;
	producers: MediasoupProducerSample[];
	consumers: MediasoupConsumerSample[];
	dataProducers: MediasoupDataProducerSample[];
	dataConsumers: MediasoupDataConsumerSample[];
	transports: MediasoupTransportSample[];
};

type MediasoupWebRtcTransportSampleEventTypes =
	| 'icestate-changed-to-new'
	| 'icestate-changed-to-connected'
	| 'icestate-changed-to-completed'
	| 'icestate-changed-to-disconnected'
	| 'icestate-changed-to-closed'
	| 'dtlsstate-changed-to-new'
	| 'dtlsstate-changed-to-connecting'
	| 'dtlsstate-changed-to-connected'
	| 'dtlsstate-changed-to-failed'
	| 'dtlsstate-changed-to-closed'
	| 'sctpstate-changed-to-new'
	| 'sctpstate-changed-to-connecting'
	| 'sctpstate-changed-to-connected'
	| 'sctpstate-changed-to-failed'
	| 'sctpstate-changed-to-closed'
	| 'iceselectedtuple-changed';

export type MediasoupWebRtcTransportSampleEventMap = {
	[K in MediasoupWebRtcTransportSampleEventTypes]: SampleHistoryItem<K>;
}[MediasoupWebRtcTransportSampleEventTypes];

export type MediasoupWebRtcTransportSample = {
	type: 'webrtc';
	history: MediasoupWebRtcTransportSampleEventMap[];
}

/* ---- plain transport (mediasoup `PlainTransport`: `sctpstatechange`; `tuple` / `rtcptuple`) ---- */

type MediasoupPlainTransportSampleEventTypes =
	| 'sctpstate-changed-to-new'
	| 'sctpstate-changed-to-connecting'
	| 'sctpstate-changed-to-connected'
	| 'sctpstate-changed-to-failed'
	| 'sctpstate-changed-to-closed'
	| 'tuple-changed'
	| 'rtcptuple-changed';

export type MediasoupPlainTransportSampleEventMap = {
	[K in MediasoupPlainTransportSampleEventTypes]: SampleHistoryItem<K>;
}[MediasoupPlainTransportSampleEventTypes];

export type MediasoupPlainTransportSample = {
	type: 'plain';
	// PlainTransport carries a separate RTCP tuple when RTCP-mux is disabled; the RTP tuple is the
	// base `tuple`. Tuple changes update these latest-value fields (not history), like WebRTC's `tuple`.
	rtcpTuple?: TransportTuple;
	history: MediasoupPlainTransportSampleEventMap[];
}

/* ---- pipe transport (mediasoup `PipeTransport`: `sctpstatechange`) ---- */

type MediasoupPipeTransportSampleEventTypes =
	| 'sctpstate-changed-to-new'
	| 'sctpstate-changed-to-connecting'
	| 'sctpstate-changed-to-connected'
	| 'sctpstate-changed-to-failed'
	| 'sctpstate-changed-to-closed';

export type MediasoupPipeTransportSampleEventMap = {
	[K in MediasoupPipeTransportSampleEventTypes]: SampleHistoryItem<K>;
}[MediasoupPipeTransportSampleEventTypes];

export type MediasoupPipeTransportSample = {
	type: 'pipe';
	history: MediasoupPipeTransportSampleEventMap[];
}

/* ---- direct transport (mediasoup `DirectTransport`: no state machine; only raw `rtcp` packets) ---- */

// DirectTransport has no ICE/DTLS/SCTP state changes, so there are no history event types and the
// history is always empty (`never[]`). Kept for shape parity with the other transport variants.
type MediasoupDirectTransportSampleEventTypes = never;

export type MediasoupDirectTransportSampleEventMap = {
	[K in MediasoupDirectTransportSampleEventTypes]: SampleHistoryItem<K>;
}[MediasoupDirectTransportSampleEventTypes];

export type MediasoupDirectTransportSample = {
	type: 'direct';
	history: MediasoupDirectTransportSampleEventMap[];
}

export type MediasoupTransportSample = Record<string, unknown> & {
	id: string;
	createdAt: number;
	// The moment the transport became connected — a universal milestone every transport reaches, but
	// derived per-type since mediasoup has no single "connected" event: WebRTC = DTLS `'connected'`,
	// Plain/Pipe = `tuple` detected / SCTP `'connected'` (or the `connect()` call), Direct = at creation.
	connectedAt?: number;
	closedAt?: number;
	tuple?: TransportTuple;
} & (
	| MediasoupWebRtcTransportSample
	| MediasoupPlainTransportSample
	| MediasoupPipeTransportSample
	| MediasoupDirectTransportSample
);

export type MediasoupProducerSampleEventMap = {
	'pause': undefined,
	'resume': undefined,
	'degraded': undefined,
	'restored': undefined,
}

export type MediasoupProducerSampleEvent = {
	[K in keyof MediasoupProducerSampleEventMap]: SampleHistoryItem<K>;
}[keyof MediasoupProducerSampleEventMap];

export type MediasoupProducerSample = Record<string, unknown> & {
	id: string;
	transportId: string;
	createdAt: number;
	closedAt?: number;
	codecInfo: RtpCodecParameters;
	kind: 'audio' | 'video';
	ssrcs?: number[];
	rids?: string[];
	history: MediasoupProducerSampleEvent[];
};

export type MediasoupConsumerSampleEventMap = {
	'pause': undefined,
	'resume': undefined,
	'producerPaused': undefined,
	'producerResumed': undefined,
	'stopped': undefined,
	'started': undefined,
	'degraded': undefined,
	'restored': undefined,
}

export type MediasoupConsumerSampleEvent = {
	[K in keyof MediasoupConsumerSampleEventMap]: SampleHistoryItem<K>;
}[keyof MediasoupConsumerSampleEventMap];

export type MediasoupConsumerSample = Record<string, unknown> & {
	id: string;
	producerId: string;
	transportId: string;
	createdAt: number;
	closedAt?: number;
	kind: 'audio' | 'video';
	history: MediasoupConsumerSampleEvent[];
};

export type MediasoupDataProducerSample = Record<string, unknown> & {
	id: string;
	transportId: string;
	createdAt: number;
	closedAt?: number;
	label: string;
	protocol: string;
};

export type MediasoupDataConsumerSample = Record<string, unknown> & {
	id: string;
	dataProducerId: string;
	transportId: string;
	createdAt: number;
	closedAt?: number;
	label: string;
	protocol: string;
};
