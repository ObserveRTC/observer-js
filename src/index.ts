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
// Detectors are never created implicitly. Register observer-scoped ones with
// `observer.addObserverDetector(name, config)` and call-scoped ones with
// `observer.addCallDetector(name, config)` (stored in `observer.callDetectorConfigs`, applied to
// every call the observer creates) or `observedCall.addDetector(name, config)` for one call.
// Issue-driven correlation: the client reports WHAT is wrong for itself, the observer correlates
// WHO ELSE is in the same state and WHERE in publisher -> SFU -> subscriber the fault sits.
// Issues are PUSHED to whoever registered for them rather than scanned for; a detector implements
// `ActiveIssueTracker` and is fed the types it consumes.
export { ActiveIssuesRegistry } from './issues/ActiveIssuesRegistry';
export { ObservedClientIssueRegistry } from './issues/ObservedClientIssueRegistry';
export type { ActiveIssueTracker } from './issues/ActiveIssueTracker';
export {
	RESOLVED_ISSUE_SUFFIX,
	baseIssueType,
	isClientIssueResolutionEntry,
} from './issues/ActiveClientIssue';
export type { ActiveClientIssue, ResolvedActiveClientIssue } from './issues/ActiveClientIssue';
// Server-raised findings. Unlike `ClientIssue` (a wire type, string payload) these are delivered to
// an in-process handler, so the payload is the object itself — no stringify/parse. `CallIssue` and
// `ObserverIssue` differ by the scope that raised them, which each carries as `scope`.
export { issuePayloadAsString } from './common/Issue';
export type { Issue, IssueBase, CallIssue, ObserverIssue } from './common/Issue';
// "Is this meeting in trouble?" and "is our infrastructure in trouble?" are separate detectors with
// separate gates and separate findings — not one detector branching on what it was handed.
export {
	CallConcurrentIssueDetector,
	CallConcurrentIssueTypes,
} from './detectors/CallConcurrentIssueDetector';
export type {
	CallConcurrentIssueDetectorConfig,
	CallConcurrentIssueGroup,
} from './detectors/CallConcurrentIssueDetector';
export {
	ObserverConcurrentIssueDetector,
	ObserverConcurrentIssueTypes,
} from './detectors/ObserverConcurrentIssueDetector';
export type {
	ObserverConcurrentIssueDetectorConfig,
	ObserverConcurrentIssueGroup,
} from './detectors/ObserverConcurrentIssueDetector';
export {
	IssueFanOutDetector,
	IssueFanOutTypes,
} from './detectors/IssueFanOutDetector';
export type { IssueFanOutDetectorConfig } from './detectors/IssueFanOutDetector';
// Both ends of one published track complaining at once — the source is implicated, not inferred.
export {
	PublisherFaultCorroborationDetector,
	PublisherFaultTypes,
} from './detectors/PublisherFaultCorroborationDetector';
export type {
	PublisherFaultCorroborationDetectorConfig,
	CorroboratedPublisherFault,
} from './detectors/PublisherFaultCorroborationDetector';
// The one correlation that is neither per-call nor per-server: an issue concentrated on one browser,
// one browser version or one OS. Endpoint symptoms spread across unrelated calls implicate the
// clients, not the SFU.
export {
	ClientPopulationIssueDetector,
	ClientPopulationIssueTypes,
} from './detectors/ClientPopulationIssueDetector';
export type {
	ClientPopulationIssueDetectorConfig,
	ClientPopulationAxis,
	ClientPopulation,
} from './detectors/ClientPopulationIssueDetector';
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
// NOTE there is no ICE detector here. ICE trouble is reported by client-monitor-js >= 4.6.0 as the
// keyed issues `ice-disconnected` / `ice-connection-failed` / `ice-transport-stalled` /
// `unstable-ice-path`, with hysteresis behind each verdict. Correlating them is a matter of config,
// not of another class:
//
//   observer.addObserverDetector('observer-concurrent-issue-detector', {
//     issueTypes: [ 'ice-disconnected', 'ice-connection-failed', 'ice-transport-stalled' ],
//   });
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
export {
	RemoteTrackResolverValidator,
	UNRESOLVED_TRACK_LINKS_ISSUE,
} from './validators/RemoteTrackResolverValidator';
export type {
	RemoteTrackResolverValidatorConfig,
	RemoteTrackResolverReportPayload,
	RemoteTrackLinkEvidence,
} from './validators/RemoteTrackResolverValidator';
export {
	CodecConsistencyValidator,
	CODEC_MISMATCH_ISSUE,
} from './validators/CodecConsistencyValidator';
export type {
	CodecConsistencyValidatorConfig,
	CodecConsistencyReportPayload,
	CodecEvidence,
} from './validators/CodecConsistencyValidator';
// The interpretation layer: what a correlated cohort implies, and where to look.
export { concludeCallIssue, concludeObserverIssue } from './detectors/IssueConclusion';
export type {
	IssueConclusion,
	IssueFaultDomain,
	CallIssueSpread,
	ObserverIssueSpread,
} from './detectors/IssueConclusion';
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
