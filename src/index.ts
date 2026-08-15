export type { ObserverEvents, SampleRejectedReason, AcceptContext, CallAppDataFactory, ClientAppDataFactory, AcceptMiddleware, AcceptMiddlewarePayload } from './Observer';
export type {
	ObserverEventBase,
	ObservedCallScope,
	ObservedClientScope,
	ObservedPeerConnectionScope,
	ObservedMediasoupRouterScope,
} from './ObserverEvents';
export type {
	ObservedMediasoupRouterSettings,
	ObservedMediasoupRouterEvents,
	MediasoupSampleEnricher,
} from './ObservedMediasoupRouter';
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
// Detector auto-creation: `ObserverConfig.detectors` / `.callDetectors` build these on construction.
// Each slot is `undefined` (defaults), an object (overrides), or `null` (don't create).
export { createCallDetectors, createObserverDetectors, detectorSlot } from './detectors/DetectorsConfig';
export type {
	CallDetectorsConfig,
	ObserverDetectorsConfig,
	CallDetectorDefaults,
	ObserverDetectorDefaults,
	DetectorSlot,
} from './detectors/DetectorsConfig';
// Every threshold the library applies out of the box, spelled out in `Observer.ts`. Read or spread
// these instead of copying magic numbers into your own config.
export { defaultCallDetectorsConfig, defaultObserverDetectorsConfig } from './Observer';
// Concrete cross-client detectors. Registered automatically from the config above; you can also
// construct them yourself and `add(...)` them to `call.detectors` / `observer.detectors`.
export {
	TurnServerHealthDetector,
	TurnServerHealthTypes,
} from './detectors/TurnServerHealthDetector';
export type { TurnServerHealthDetectorConfig, TurnServerHealth } from './detectors/TurnServerHealthDetector';
export {
	TurnServerOutageDetector,
	TurnServerOutageTypes,
} from './detectors/TurnServerOutageDetector';
export type { TurnServerOutageDetectorConfig } from './detectors/TurnServerOutageDetector';
// Issue-driven correlation: the client reports WHAT is wrong for itself, the observer correlates
// WHO ELSE is in the same state and WHERE in publisher -> SFU -> subscriber the fault sits.
// The indexed active-issue set every issue-driven detector reads. One per call, propagating into the
// observer's — reach it via `observedCall.issueIndex` / `observer.issueIndex` rather than constructing.
export { IssueIndex } from './utils/IssueIndex';
export type { IssueCohort } from './utils/IssueIndex';
export {
	RESOLVED_ISSUE_SUFFIX,
	baseIssueType,
	isResolutionEntry,
	parseIssuePayload,
} from './common/ActiveClientIssue';
export type { ActiveClientIssue, ResolvedClientIssue } from './common/ActiveClientIssue';
// Server-raised findings. Unlike `ClientIssue` (a wire type, string payload) an `ObserverIssue` is
// delivered to an in-process handler, so its payload is the object itself — no stringify/parse.
export { issuePayloadOf, issuePayloadAsString } from './common/ObserverIssue';
export type { ObserverIssue } from './common/ObserverIssue';
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
	TrackDeliveryMismatchDetector,
	TrackDeliveryMismatchTypes,
} from './detectors/TrackDeliveryMismatchDetector';
export type { TrackDeliveryMismatchDetectorConfig } from './detectors/TrackDeliveryMismatchDetector';
export {
	UnconsumedTrackDetector,
	UnconsumedTrackTypes,
} from './detectors/UnconsumedTrackDetector';
export type { UnconsumedTrackDetectorConfig } from './detectors/UnconsumedTrackDetector';
// `IceDisruptionDetector` reads ICE state *transitions* rather than quality metrics, so no client
// issue replaces it: it is the fallback for clients without issue reporting, and the only detector
// that catches flaps occurring between two `update()` ticks.
export {
	IceDisruptionDetector,
	IceDisruptionTypes,
} from './detectors/IceDisruptionDetector';
export type { IceDisruptionDetectorConfig } from './detectors/IceDisruptionDetector';
// Validators: one-shot structural checks. A detector answers "is something wrong right now?" and runs
// forever; a validator answers "is this deployment built correctly?", reports once, and is dropped.
// Start one with `observer.addValidator(name, config)`.
export type { Validator, RunningValidator, ValidationReport } from './validators/Validator';
export type { AvailableValidatorConfigs, ValidatorName } from './validators/Validators';
export {
	SimulcastReceiverValidator,
	defaultSimulcastReceiverValidatorConfig,
	LOWEST_COMMON_DENOMINATOR_ISSUE,
} from './validators/SimulcastReceiverValidator';
export type {
	SimulcastReceiverValidatorConfig,
	SimulcastReceiverReportPayload,
	SimulcastReceiverEvidence,
} from './validators/SimulcastReceiverValidator';
// The interpretation layer: what a correlated cohort implies, and where to look.
export { concludeFrom } from './detectors/IssueConclusion';
export type { IssueConclusion, IssueFaultDomain, IssueSpread } from './detectors/IssueConclusion';
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
export { RemoteTrackResolver } from './resolvers/RemoteTrackResolver';
export type { RemoteTrackResolvers, RemoteTrackResolverFactory } from './resolvers/RemoteTrackResolver';
export {
	createDefaultMediasoupRemoteTrackResolverFactory,
	createP2pRemoteTrackResolverFactory,
} from './resolvers/RemoteTrackResolverFactories';
