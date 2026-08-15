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
export type { Detector } from './detectors/Detector';
export { Detectors } from './detectors/Detectors';
export type {
	AvailableDetectorsConfigs,
	AvailableCallScopeDetectorsConfigs,
	AvailableObserverScopeDetectorsConfigs,
} from './detectors/Detectors';
export {
	CallHealthAggregator,
	defaultClientHealthThresholds,
} from './utils/CallHealthAggregator';
export type {
	CallHealth,
	ClientHealth,
	ClientHealthThresholds,
} from './utils/CallHealthAggregator';
// Detector auto-creation: `ObserverConfig.observerDetectors` / `.callDetectors` build these on
// construction. Each slot is `undefined` (defaults), an object (overrides), or `null` (don't create).
export { OBSERVER_SCOPE_DETECTOR_NAMES, CALL_SCOPE_DETECTOR_NAMES } from './Observer';
export type { DetectorSlot } from './Observer';
// Issue-driven correlation: the client reports WHAT is wrong for itself, the observer correlates
// WHO ELSE is in the same state and WHERE in publisher -> SFU -> subscriber the fault sits.
// Issues are PUSHED to whoever registered for them rather than scanned for; a detector implements
// `ActiveIssueTracker` and is fed the types it consumes.
export { ActiveIssuesRegistry, ANY_ISSUE_TYPE } from './issues/ActiveIssuesRegistry';
export { ObservedClientIssueRegistry } from './issues/ObservedClientIssueRegistry';
export type { ActiveIssueTracker } from './issues/ActiveIssueTracker';
export {
	RESOLVED_ISSUE_SUFFIX,
	baseIssueType,
	isClientIssueResolutionEntry,
} from './issues/ActiveClientIssue';
export type { ActiveClientIssue, ResolvedActiveClientIssue } from './issues/ActiveClientIssue';
// Server-raised findings. Unlike `ClientIssue` (a wire type, string payload) an `ObserverIssue` is
// delivered to an in-process handler, so its payload is the object itself — no stringify/parse.
export { issuePayloadOf, issuePayloadAsString } from './common/ObserverIssue';
export type { ObserverIssue } from './common/ObserverIssue';
export {
	ConcurrentIssueDetector,
	ConcurrentIssueTypes,
} from './detectors/ConcurrentIssueDetector';
export type { ConcurrentIssueDetectorConfig, ConcurrentIssueGroup } from './detectors/ConcurrentIssueDetector';
export {
	IssueFanOutDetector,
	IssueFanOutTypes,
} from './detectors/IssueFanOutDetector';
export type { IssueFanOutDetectorConfig } from './detectors/IssueFanOutDetector';
export {
	SfuCongestionDetector,
} from './detectors/SfuCongestionDetector';
export type {
	SfuCongestionDetectorConfig,
	SfuCongestionDetectorBucket,
	SfuCongestionDetectorReport,
	SfuCongestionDetectorEvaluation,
} from './detectors/SfuCongestionDetector';
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
export {
	percentile,
	percentileOfSorted,
	median,
	medianAbsoluteDeviation,
	robustZScore,
	summarize,
	counterDelta,
	correlation,
	pageHinkley,
	mannKendall,
	mannKendallVerdict,
} from './utils/stats';
export type { StatsSummary, PageHinkleyResult, MannKendallResult } from './utils/stats';
export { SlidingWindow } from './utils/SlidingWindow';
export type { SlidingWindowEntry } from './utils/SlidingWindow';
export { TrendTester } from './utils/TrendTester';
export type { TrendTesterConfig } from './utils/TrendTester';
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
