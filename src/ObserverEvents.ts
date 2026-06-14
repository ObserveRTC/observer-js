import type { Observer, AcceptContext, SampleRejectedReason } from './Observer';
import type { ObservedCall } from './ObservedCall';
import type { ObservedClient } from './ObservedClient';
import type { ObservedPeerConnection } from './ObservedPeerConnection';
import type { ObservedInboundRtp } from './ObservedInboundRtp';
import type { ObservedOutboundRtp } from './ObservedOutboundRtp';
import type { ObservedRemoteInboundRtp } from './ObservedRemoteInboundRtp';
import type { ObservedRemoteOutboundRtp } from './ObservedRemoteOutboundRtp';
import type { ObservedDataChannel } from './ObservedDataChannel';
import type { ObservedIceCandidate } from './ObservedIceCandidate';
import type { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
import type { ObservedIceTransport } from './ObservedIceTransport';
import type { ObservedCertificate } from './ObservedCertificate';
import type { ObservedCodec } from './ObservedCodec';
import type { ObservedMediaSource } from './ObservedMediaSource';
import type { ObservedMediaPlayout } from './ObservedMediaPlayout';
import type { ObservedPeerConnectionTransport } from './ObservedPeerConnectionTransport';
import type { ObservedInboundTrack } from './ObservedInboundTrack';
import type { ObservedOutboundTrack } from './ObservedOutboundTrack';
import type { ClientSample, ClientEvent, ClientIssue, ClientMetaData, ExtensionStat } from './schema/ClientSample';
// ClientIssue doubles as the generic issue shape ({ type, payload?, timestamp? }) for call-level issues too.
import type { ClientSampleSink } from './sinks/ClientSampleSink';
import { ObservedMediasoupRouter } from './ObservedMediasoupRouter';

/**
 * The Observer is the single event bus for the whole hierarchy. Every event
 * worth subscribing to is emitted on the Observer with a payload object that
 * carries the ancestry of the entity it originates from, down to the subject,
 * plus the optional `context` passed through `accept(sample, context?)`.
 *
 * Lifecycle/coordination events (close, update, joined, left, newclient, ...)
 * remain as local EventEmitter events on each Observed* component so that
 * parent/child teardown and the updaters can wire to them directly.
 */

/** Base fields present on every Observer event payload. */
export type ObserverEventBase = {
	observer: Observer;
	context?: AcceptContext;
};

/** Scope reaching a call. */
export type ObservedCallScope = ObserverEventBase & {
	observedCall: ObservedCall;
};

/** Scope reaching a client (carries its call). */
export type ObservedClientScope = ObservedCallScope & {
	observedClient: ObservedClient;
};

/** Scope reaching a peer connection (carries its call and client). */
export type ObservedPeerConnectionScope = ObservedClientScope & {
	observedPeerConnection: ObservedPeerConnection;
};

export type ObservedMediasoupRouterScope = Omit<ObserverEventBase, 'context'> & {
	observedMediasoupRouter: ObservedMediasoupRouter;
};

export type ObserverEvents = {
	// observer level
	'observer-updated': [ObserverEventBase];
	'observer-closed': [ObserverEventBase];
	'sample-rejected': [ObserverEventBase & { reason: SampleRejectedReason, sample: ClientSample }];

	// mediasoup level
	'mediasoup-router-added': [ObservedMediasoupRouterScope];
	'mediasoup-router-removed': [ObservedMediasoupRouterScope];
	'mediasoup-router-matched-with-call': [ObservedMediasoupRouterScope & ObservedCallScope];

	// call level
	'call-added': [ObservedCallScope];
	'call-updated': [ObservedCallScope];
	'call-closed': [ObservedCallScope];
	'call-empty': [ObservedCallScope];
	'call-not-empty': [ObservedCallScope];
	'call-issue': [ObservedCallScope & { issue: ClientIssue }];

	// client level
	'client-added': [ObservedClientScope];
	'client-sink-created': [ObservedClientScope & { sink: ClientSampleSink }];
	'client-updated': [ObservedClientScope & { sample: ClientSample, elapsedTimeInMs: number }];
	'client-closed': [ObservedClientScope];
	'client-joined': [ObservedClientScope];
	'client-left': [ObservedClientScope];
	'client-rejoined': [ObservedClientScope & { timestamp: number }];
	'client-issue': [ObservedClientScope & { issue: ClientIssue }];
	'client-metadata': [ObservedClientScope & { metaData: ClientMetaData }];
	'client-extension-stats': [ObservedClientScope & { extensionStats: ExtensionStat }];
	'client-event': [ObservedClientScope & { event: ClientEvent }];

	// peer connection level
	'peer-connection-added': [ObservedPeerConnectionScope];
	'peer-connection-updated': [ObservedPeerConnectionScope];
	'peer-connection-closed': [ObservedPeerConnectionScope];
	'ice-connection-state-changed': [ObservedPeerConnectionScope & { state: string }];
	'ice-gathering-state-changed': [ObservedPeerConnectionScope & { state: string }];
	'connection-state-changed': [ObservedPeerConnectionScope & { state: string }];
	'selected-candidate-pair-changed': [ObservedPeerConnectionScope];

	// peer-connection sub-entities
	'certificate-added': [ObservedPeerConnectionScope & { observedCertificate: ObservedCertificate }];
	'certificate-updated': [ObservedPeerConnectionScope & { observedCertificate: ObservedCertificate }];
	'certificate-removed': [ObservedPeerConnectionScope & { observedCertificate: ObservedCertificate }];

	'codec-added': [ObservedPeerConnectionScope & { observedCodec: ObservedCodec }];
	'codec-updated': [ObservedPeerConnectionScope & { observedCodec: ObservedCodec }];
	'codec-removed': [ObservedPeerConnectionScope & { observedCodec: ObservedCodec }];

	'inbound-rtp-added': [ObservedPeerConnectionScope & { observedInboundRtp: ObservedInboundRtp }];
	'inbound-rtp-updated': [ObservedPeerConnectionScope & { observedInboundRtp: ObservedInboundRtp }];
	'inbound-rtp-removed': [ObservedPeerConnectionScope & { observedInboundRtp: ObservedInboundRtp }];

	'outbound-rtp-added': [ObservedPeerConnectionScope & { observedOutboundRtp: ObservedOutboundRtp }];
	'outbound-rtp-updated': [ObservedPeerConnectionScope & { observedOutboundRtp: ObservedOutboundRtp }];
	'outbound-rtp-removed': [ObservedPeerConnectionScope & { observedOutboundRtp: ObservedOutboundRtp }];

	'remote-inbound-rtp-added': [ObservedPeerConnectionScope & { observedRemoteInboundRtp: ObservedRemoteInboundRtp }];
	'remote-inbound-rtp-updated': [ObservedPeerConnectionScope & { observedRemoteInboundRtp: ObservedRemoteInboundRtp }];
	'remote-inbound-rtp-removed': [ObservedPeerConnectionScope & { observedRemoteInboundRtp: ObservedRemoteInboundRtp }];

	'remote-outbound-rtp-added': [ObservedPeerConnectionScope & { observedRemoteOutboundRtp: ObservedRemoteOutboundRtp }];
	'remote-outbound-rtp-updated': [ObservedPeerConnectionScope & { observedRemoteOutboundRtp: ObservedRemoteOutboundRtp }];
	'remote-outbound-rtp-removed': [ObservedPeerConnectionScope & { observedRemoteOutboundRtp: ObservedRemoteOutboundRtp }];

	'data-channel-added': [ObservedPeerConnectionScope & { observedDataChannel: ObservedDataChannel }];
	'data-channel-updated': [ObservedPeerConnectionScope & { observedDataChannel: ObservedDataChannel }];
	'data-channel-removed': [ObservedPeerConnectionScope & { observedDataChannel: ObservedDataChannel }];

	'ice-candidate-added': [ObservedPeerConnectionScope & { observedIceCandidate: ObservedIceCandidate }];
	'ice-candidate-updated': [ObservedPeerConnectionScope & { observedIceCandidate: ObservedIceCandidate }];
	'ice-candidate-removed': [ObservedPeerConnectionScope & { observedIceCandidate: ObservedIceCandidate }];

	'ice-candidate-pair-added': [ObservedPeerConnectionScope & { observedIceCandidatePair: ObservedIceCandidatePair }];
	'ice-candidate-pair-updated': [ObservedPeerConnectionScope & { observedIceCandidatePair: ObservedIceCandidatePair }];
	'ice-candidate-pair-removed': [ObservedPeerConnectionScope & { observedIceCandidatePair: ObservedIceCandidatePair }];

	'ice-transport-added': [ObservedPeerConnectionScope & { observedIceTransport: ObservedIceTransport }];
	'ice-transport-updated': [ObservedPeerConnectionScope & { observedIceTransport: ObservedIceTransport }];
	'ice-transport-removed': [ObservedPeerConnectionScope & { observedIceTransport: ObservedIceTransport }];

	'media-source-added': [ObservedPeerConnectionScope & { observedMediaSource: ObservedMediaSource }];
	'media-source-updated': [ObservedPeerConnectionScope & { observedMediaSource: ObservedMediaSource }];
	'media-source-removed': [ObservedPeerConnectionScope & { observedMediaSource: ObservedMediaSource }];

	'media-playout-added': [ObservedPeerConnectionScope & { observedMediaPlayout: ObservedMediaPlayout }];
	'media-playout-updated': [ObservedPeerConnectionScope & { observedMediaPlayout: ObservedMediaPlayout }];
	'media-playout-removed': [ObservedPeerConnectionScope & { observedMediaPlayout: ObservedMediaPlayout }];

	'peer-connection-transport-added': [ObservedPeerConnectionScope & { observedPeerConnectionTransport: ObservedPeerConnectionTransport }];
	'peer-connection-transport-updated': [ObservedPeerConnectionScope & { observedPeerConnectionTransport: ObservedPeerConnectionTransport }];
	'peer-connection-transport-removed': [ObservedPeerConnectionScope & { observedPeerConnectionTransport: ObservedPeerConnectionTransport }];

	'inbound-track-added': [ObservedPeerConnectionScope & { observedInboundTrack: ObservedInboundTrack }];
	'inbound-track-updated': [ObservedPeerConnectionScope & { observedInboundTrack: ObservedInboundTrack }];
	'inbound-track-removed': [ObservedPeerConnectionScope & { observedInboundTrack: ObservedInboundTrack }];
	'inbound-track-muted': [ObservedPeerConnectionScope & { observedInboundTrack: ObservedInboundTrack }];
	'inbound-track-unmuted': [ObservedPeerConnectionScope & { observedInboundTrack: ObservedInboundTrack }];

	'outbound-track-added': [ObservedPeerConnectionScope & { observedOutboundTrack: ObservedOutboundTrack }];
	'outbound-track-updated': [ObservedPeerConnectionScope & { observedOutboundTrack: ObservedOutboundTrack }];
	'outbound-track-removed': [ObservedPeerConnectionScope & { observedOutboundTrack: ObservedOutboundTrack }];
	'outbound-track-muted': [ObservedPeerConnectionScope & { observedOutboundTrack: ObservedOutboundTrack }];
	'outbound-track-unmuted': [ObservedPeerConnectionScope & { observedOutboundTrack: ObservedOutboundTrack }];
};
