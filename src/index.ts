export type { ObserverEvents, SampleRejectedReason, AcceptContext, CallAppDataFactory, ClientAppDataFactory, AcceptMiddleware, AcceptMiddlewarePayload } from './Observer';
export type {
	ObserverEventBase,
	ObservedCallScope,
	ObservedClientScope,
	ObservedPeerConnectionScope,
	ObservedMediasoupRouterScope,
} from './ObserverEvents';
export type { ObservedMediasoupRouterSettings, ObservedMediasoupRouterEvents } from './ObservedMediasoupRouter';
export type {
	MediasoupRouterSample,
	MediasoupTransportSample,
	MediasoupProducerSample,
	MediasoupConsumerSample,
	MediasoupDataProducerSample,
	MediasoupDataConsumerSample,
	MediasoupWebRtcTransportSample,
	MediasoupPlainTransportSample,
	MediasoupPipeTransportSample,
	MediasoupDirectTransportSample,
	MediasoupWebRtcTransportSampleEventMap,
	MediasoupPlainTransportSampleEventMap,
	MediasoupPipeTransportSampleEventMap,
	MediasoupDirectTransportSampleEventMap,
	MediasoupProducerSampleEvent,
	MediasoupConsumerSampleEvent,
} from './schema/MediasoupRouter';

export { Observer } from './Observer';
export { ObservedCall } from './ObservedCall';
export { ObservedInboundTrack } from './ObservedInboundTrack';
export { ObservedOutboundTrack } from './ObservedOutboundTrack';
export { ObservedClient } from './ObservedClient';
export { ObservedPeerConnection } from './ObservedPeerConnection';
export { ObservedMediaSource } from './ObservedMediaSource';
export { ObservedMediaPlayout } from './ObservedMediaPlayout';
export { ObservedCodec } from './ObservedCodec';
export { ObservedCertificate } from './ObservedCertificate';
export { ObservedDataChannel } from './ObservedDataChannel';
export { ObservedInboundRtp } from './ObservedInboundRtp';
export { ObservedOutboundRtp } from './ObservedOutboundRtp';
export { ObservedRemoteInboundRtp } from './ObservedRemoteInboundRtp';
export { ObservedRemoteOutboundRtp } from './ObservedRemoteOutboundRtp';
export { ObservedMediasoupRouter } from './ObservedMediasoupRouter';
export { ObservedIceCandidatePair } from './ObservedIceCandidatePair';
export { ObservedIceCandidate } from './ObservedIceCandidate';
export { ObservedIceTransport } from './ObservedIceTransport';
export { ObservedPeerConnectionTransport } from './ObservedPeerConnectionTransport';
export { ClientEventTypes } from './schema/ClientEventTypes';
export { ClientMetaTypes } from './schema/ClientMetaTypes';
export { ClientSample, ClientIssue, ClientEvent, ClientMetaData } from './schema/ClientSample';
export { ScoreCalculator } from './scores/ScoreCalculator';
export { Detectors } from './detectors/Detectors';
export type { Detector } from './detectors/Detector';
// Cross-client detection: the publisher→subscribers aggregation primitive and the detectors on it.
export {
	TrackDistributionAggregator,
	defaultReceiverHealthThresholds,
} from './utils/TrackDistributionAggregator';
export type {
	ObservedTrackDistribution,
	ReceiverDistributionEntry,
	PublisherDistributionEntry,
	ReceiverHealthThresholds,
} from './utils/TrackDistributionAggregator';
export {
	CallHealthAggregator,
	defaultClientHealthThresholds,
} from './utils/CallHealthAggregator';
export type {
	CallHealth,
	ClientHealth,
	ClientHealthThresholds,
} from './utils/CallHealthAggregator';
// Concrete cross-client detectors (all opt-in — register them on `call.detectors` /
// `observer.detectors`; the library ships none of them enabled).
export {
	CommonSourceDegradationDetector,
	CommonSourceDegradationTypes,
} from './detectors/CommonSourceDegradationDetector';
export type { CommonSourceDegradationDetectorConfig } from './detectors/CommonSourceDegradationDetector';
export {
	CallWideDegradationDetector,
	CallWideDegradationTypes,
} from './detectors/CallWideDegradationDetector';
export type { CallWideDegradationDetectorConfig } from './detectors/CallWideDegradationDetector';
export {
	PliAndFreezeFanOutDetector,
	PliAndFreezeFanOutTypes,
} from './detectors/PliAndFreezeFanOutDetector';
export type { PliAndFreezeFanOutDetectorConfig } from './detectors/PliAndFreezeFanOutDetector';
export {
	AudioImpairmentFanOutDetector,
	AudioImpairmentFanOutTypes,
} from './detectors/AudioImpairmentFanOutDetector';
export type { AudioImpairmentFanOutDetectorConfig } from './detectors/AudioImpairmentFanOutDetector';
export {
	IceDisruptionDetector,
	IceDisruptionTypes,
} from './detectors/IceDisruptionDetector';
export type { IceDisruptionDetectorConfig } from './detectors/IceDisruptionDetector';
export {
	TurnServerHealthDetector,
	TurnServerHealthTypes,
} from './detectors/TurnServerHealthDetector';
export type { TurnServerHealthDetectorConfig, TurnServerHealth } from './detectors/TurnServerHealthDetector';
// Issue-driven correlation: the client reports WHAT is wrong for itself, the observer correlates
// WHO ELSE is in the same state and WHERE in publisher -> SFU -> subscriber the fault sits.
export { IssueRegistry } from './utils/IssueRegistry';
export type { IssueCohort, IssueRegistryConfig } from './utils/IssueRegistry';
export {
	RESOLVED_ISSUE_SUFFIX,
	baseIssueType,
	isResolutionEntry,
	parseIssuePayload,
} from './common/ActiveClientIssue';
export type { ActiveClientIssue, ResolvedClientIssue } from './common/ActiveClientIssue';
export {
	ConcurrentIssueDetector,
	ConcurrentIssueTypes,
} from './detectors/ConcurrentIssueDetector';
export type { ConcurrentIssueDetectorConfig } from './detectors/ConcurrentIssueDetector';
export {
	IssueFanOutDetector,
	IssueFanOutTypes,
} from './detectors/IssueFanOutDetector';
export type { IssueFanOutDetectorConfig } from './detectors/IssueFanOutDetector';
export {
	WorstReceiverContagionDetector,
	WorstReceiverContagionTypes,
} from './detectors/WorstReceiverContagionDetector';
export type { WorstReceiverContagionDetectorConfig } from './detectors/WorstReceiverContagionDetector';
export {
	TrackDeliveryMismatchDetector,
	TrackDeliveryMismatchTypes,
} from './detectors/TrackDeliveryMismatchDetector';
export type { TrackDeliveryMismatchDetectorConfig } from './detectors/TrackDeliveryMismatchDetector';
export {
	UnconsumedTrackDetector,
	UnconsumedTrackTypes,
} from './detectors/UnconsumedTrackDetector';
export type { UnconsumedTrackDetectorConfig } from './detectors/UnconsumedTrackDetector';
// Statistics helpers for building your own detectors.
export { percentile, median, summarize, counterDelta, SlidingWindow } from './utils/stats';
export type { StatsSummary, SlidingWindowEntry } from './utils/stats';
export { createLogger, setObserverLogger } from './common/logger';
export type { Logger, ObserverLogger } from './common/logger';
// Per-client sample sinks. `ClientSampleSink` is the base class to subclass for a custom
// destination; `JsonlFileSink` / `InMemorySink` are the built-ins.
export {
	ClientSampleSink,
	JsonlFileSink,
	createJsonlFileSink,
	createJsonlFileSinkFactory,
	InMemorySink,
	createInMemorySink,
} from './sinks';
export type {
	ClientSampleSinkEvents,
	ClientSampleSinkFactory,
	JsonlFileSinkOptions,
	JsonlFileSinkFactoryOptions,
} from './sinks';
export { Middleware } from './common/Middleware';
// Remote track correlation: the generic resolver + built-in strategy factories.
export { RemoteTrackResolver } from './utils/RemoteTrackResolver';
export type { RemoteTrackResolvers, RemoteTrackResolverFactory } from './utils/RemoteTrackResolver';
export {
	createDefaultMediasoupRemoteTrackResolverFactory,
	createP2pRemoteTrackResolverFactory,
} from './utils/RemoteTrackResolverFactories';
