/* eslint-disable no-shadow */

/* ================================================================================================
 * W3C types, defined here rather than taken from the DOM lib
 *
 * These mirror types from the WebRTC and Media Capture specs. They used to come from TypeScript's
 * `dom` lib, which meant this **Node-only** library compiled with every browser global in scope:
 * `window`, `document`, `fetch`, `localStorage`, and — the one that actually bites — a `setTimeout`
 * typed to return `number` instead of Node's `Timeout`. Code referencing something that does not
 * exist at runtime would type-check happily and fail in production.
 *
 * The types themselves are still wanted: these payloads are what a browser client reports, so they
 * should read in the browser's vocabulary. So they are declared here, and `dom` is out of
 * `tsconfig.json`.
 *
 * The enumerations below are verbatim from the spec and stable. The three `MediaTrack*` shapes are
 * deliberately looser than the DOM originals: this library only ever *reads* them, parsed from JSON
 * that some client serialised, and a faithful transcription of `ConstrainULong` &co. would be a lot
 * of surface area to keep in sync for no gain on the reading side.
 * ============================================================================================== */

/** Whether the candidate is for RTP or RTCP. */
export type RTCIceComponent = 'rtcp' | 'rtp';

/** The transport protocol of the candidate. */
export type RTCIceProtocol = 'tcp' | 'udp';

/** The TCP candidate type, when `protocol` is `'tcp'`. */
export type RTCIceTcpCandidateType = 'active' | 'passive' | 'so';

/** How the candidate was obtained: host, peer/server reflexive, or relayed. */
export type RTCIceCandidateType = 'host' | 'prflx' | 'relay' | 'srflx';

/**
 * A track's applied settings, as reported by `MediaStreamTrack.getSettings()`.
 *
 * The index signature is deliberate: browsers ship settings this list does not know about, and a
 * closed type would silently drop them on the way through.
 */
export type MediaTrackSettings = {
	deviceId?: string;
	groupId?: string;
	width?: number;
	height?: number;
	aspectRatio?: number;
	frameRate?: number;
	facingMode?: string;
	resizeMode?: string;
	sampleRate?: number;
	sampleSize?: number;
	channelCount?: number;
	latency?: number;
	autoGainControl?: boolean;
	echoCancellation?: boolean;
	noiseSuppression?: boolean;
	displaySurface?: string;
	[key: string]: unknown;
};

/** What a track's source is capable of, as reported by `MediaStreamTrack.getCapabilities()`. */
export type MediaTrackCapabilities = Record<string, unknown>;

/** The constraints a track was created with, as reported by `MediaStreamTrack.getConstraints()`. */
export type MediaTrackConstraints = Record<string, unknown>;

export enum ClientEventTypes {
	CLIENT_JOINED = 'CLIENT_JOINED',
	CLIENT_LEFT = 'CLIENT_LEFT',
	PEER_CONNECTION_OPENED = 'PEER_CONNECTION_OPENED',
	PEER_CONNECTION_CLOSED = 'PEER_CONNECTION_CLOSED',
	MEDIA_TRACK_ADDED = 'MEDIA_TRACK_ADDED',
	MEDIA_TRACK_REMOVED = 'MEDIA_TRACK_REMOVED',
	MEDIA_TRACK_RESUMED = 'MEDIA_TRACK_RESUMED',
	MEDIA_TRACK_MUTED = 'MEDIA_TRACK_MUTED',
	MEDIA_TRACK_UNMUTED = 'MEDIA_TRACK_UNMUTED',
	ICE_GATHERING_STATE_CHANGED = 'ICE_GATHERING_STATE_CHANGED',
	PEER_CONNECTION_STATE_CHANGED = 'PEER_CONNECTION_STATE_CHANGED',
	ICE_CONNECTION_STATE_CHANGED = 'ICE_CONNECTION_STATE_CHANGED',
	DATA_CHANNEL_OPEN = 'DATA_CHANNEL_OPEN',
	DATA_CHANNEL_CLOSED = 'DATA_CHANNEL_CLOSED',
	DATA_CHANNEL_ERROR = 'DATA_CHANNEL_ERROR',
	NEGOTIATION_NEEDED = 'NEGOTIATION_NEEDED',
	SIGNALING_STATE_CHANGE = 'SIGNALING_STATE_CHANGE',
	// ICE_GATHERING_STATE_CHANGE = 'ICE_GATHERING_STATE_CHANGE',
	// ICE_CONNECTION_STATE_CHANGE = 'ICE_CONNECTION_STATE_CHANGE',
	ICE_CANDIDATE = 'ICE_CANDIDATE',
	ICE_CANDIDATE_ERROR = 'ICE_CANDIDATE_ERROR',
	
	// mediasoup events
	PRODUCER_ADDED = 'PRODUCER_ADDED',
	PRODUCER_REMOVED = 'PRODUCER_REMOVED',
	PRODUCER_PAUSED = 'PRODUCER_PAUSED',
	PRODUCER_RESUMED = 'PRODUCER_RESUMED',
	CONSUMER_ADDED = 'CONSUMER_ADDED',
	CONSUMER_REMOVED = 'CONSUMER_REMOVED',
	CONSUMER_PAUSED = 'CONSUMER_PAUSED',
	CONSUMER_RESUMED = 'CONSUMER_RESUMED',
	DATA_PRODUCER_CREATED = 'DATA_PRODUCER_CREATED',
	DATA_PRODUCER_CLOSED = 'DATA_PRODUCER_CLOSED',
	DATA_CONSUMER_CREATED = 'DATA_CONSUMER_CREATED',
	DATA_CONSUMER_CLOSED = 'DATA_CONSUMER_CLOSED',
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClientJoinedEventPayload extends Record<string, unknown> {
	// empty
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClientLeftEventPayload extends Record<string, unknown> {
}

export interface PeerConnectionOpenedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	iceConnectionState?: string;
	iceGatheringState?: string;
	signalingState?: string;
}

export interface PeerConnectionClosedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	iceConnectionState?: string;
	iceGatheringState?: string;
	signalingState?: string;
}

export interface MediaTrackAddedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	trackId: string;
	kind: 'audio' | 'video';
	label?: string;
	muted: boolean;
	enabled: boolean;
	readyState: string;
	contentHint?: string;
	constraints: MediaTrackConstraints,
	capabilities: MediaTrackCapabilities,
	settings: MediaTrackSettings,
}

export interface MediaTrackRemovedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	trackId: string;
	kind: 'audio' | 'video';
	label?: string;
	muted: boolean;
	enabled: boolean;
	readyState: string;
	contentHint?: string;
}

export interface MediaTrackMutedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	trackId: string;
	kind: 'audio' | 'video';
	label?: string;
	muted: boolean;
	enabled: boolean;
	readyState: string;
	contentHint?: string;
}

export interface MediaTrackUnmutedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	trackId: string;
	kind: 'audio' | 'video';
	label?: string;
	muted: boolean;
	enabled: boolean;
	readyState: string;
	contentHint?: string;
}

export interface IceGatheringStateChangedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	iceGatheringState: string;
}

export interface PeerConnectionStateChangedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	connectionState: string;
}

export interface IceConnectionStateChangedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	iceConnectionState: string;
}

export interface DataChannelErrorEventPayload extends Record<string, unknown> {
	label: string;
	peerConnectionId: string;
	readyState: string;
	dataChannelId: string | number | null,
	error: string | null,
}

export interface DataChannelOpenEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	label: string;
	readyState: string;
	dataChannelId: string | number | null,
}

export interface DataChannelClosedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	label: string;
	readyState: string;
	dataChannelId: string | number | null,
}

export interface NegotiationNeededEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
}

export interface IceCandidateEventPayload extends Record<string, unknown> {
	peerConnectionId: string;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/address) */
	address?: string | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/candidate) */
	candidate?: string;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/component) */
	component?: RTCIceComponent | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/foundation) */
	foundation?: string | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/port) */
	port?: number | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/priority) */
	priority?: number | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/protocol) */
	protocol?: RTCIceProtocol | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/relatedAddress) */
	relatedAddress?: string | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/relatedPort) */
	relatedPort?: number | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/sdpMLineIndex) */
	sdpMLineIndex?: number | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/sdpMid) */
	sdpMid?: string | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/tcpType) */
	tcpType?: RTCIceTcpCandidateType | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/type) */
	type?: RTCIceCandidateType | null;

	/** [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCIceCandidate/usernameFragment) */
	usernameFragment?: string | null;
}

export interface IceCandidateErrorEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	errorCode?: number;
	errorText?: string;
	address?: string | null;
	port?: number | null;
	url?: string | null;
}

export interface SignalingStateChangedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	signalingState: string;
}

export interface ProducerAddedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
}

export interface ProducerRemovedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
}

export interface ProducerPausedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
}

export interface ProducerResumedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
}

export interface ConsumerAddedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
	consumerId: string;
	trackId: string;
}

export interface ConsumerRemovedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
	consumerId: string;
	trackId: string;
}

export interface ConsumerPausedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
	consumerId: string;
	trackId: string;
}

export interface ConsumerResumedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	producerId: string;
	consumerId: string;
	trackId: string;
}

export interface DataProducerCreatedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	dataProducerId: string;
}

export interface DataProducerClosedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	dataProducerId: string;
}

export interface DataConsumerCreatedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	dataProducerId: string;
	dataConsumerId: string;
}

export interface DataConsumerClosedEventPayload extends Record<string, unknown> {
	peerConnectionId: string;
	dataProducerId: string;
	dataConsumerId: string;
}