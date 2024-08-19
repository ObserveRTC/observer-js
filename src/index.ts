export type { ObserverConfig, ObserverEvents } from './Observer';

export { Observer } from './Observer';

export * as SampleSchema from '@observertc/sample-schemas-js';
export * as ReportSchema from '@observertc/report-schemas-js';

export type { LogLevel, Logger } from './common/logger';

export type {
	Samples,
	ClientSample,
	SfuSample,
	ExtensionStat,
	PeerConnectionTransport,
	IceCandidatePair,
	MediaSourceStat,
	MediaCodecStats,
	InboundAudioTrack,
	InboundVideoTrack,
	OutboundAudioTrack,
	OutboundVideoTrack,
	IceLocalCandidate,
	IceRemoteCandidate,
	CustomCallEvent,
	SfuTransport,
	SfuInboundRtpPad,
	SfuOutboundRtpPad,
	SfuSctpChannel,
	SfuExtensionStats,
	DataChannel,
} from '@observertc/sample-schemas-js';

export type {
	CallEventReport,
	CallMetaReport,
	ClientDataChannelReport,
	ClientExtensionReport,
	IceCandidatePairReport,
	InboundAudioTrackReport,
	InboundVideoTrackReport,
	ObserverEventReport,
	OutboundAudioTrackReport,
	OutboundVideoTrackReport,
	PeerConnectionTransportReport,
	SfuEventReport,
	SfuExtensionReport,
	SfuInboundRtpPadReport,
	SfuMetaReport,
	SfuOutboundRtpPadReport,
	SfuSctpStreamReport,
	SFUTransportReport,
} from '@observertc/report-schemas-js';
export type { 
	ClientIssueMonitorConfig, 
	ClientIssueMonitorEmittedIssueEvent, 
	ClientIssueMonitor 
} from './monitors/ClientIssueMonitor';
export type { ObservedCall, ObservedCallModel } from './ObservedCall';
export type { ObservedClient, ObservedClientModel } from './ObservedClient';
export type { ObservedPeerConnection, ObservedPeerConnectionModel, ObservedPeerConnectionEvents } from './ObservedPeerConnection';
export type { ObservedInboundAudioTrack, ObservedInboundAudioTrackModel, ObservedInboundAudioTrackEvents } from './ObservedInboundAudioTrack';
export type { ObservedOutboundAudioTrack, ObservedOutboundAudioTrackModel, ObservedOutboundAudioTrackEvents } from './ObservedOutboundAudioTrack';
export type { ObservedInboundVideoTrack, ObservedInboundVideoTrackModel, ObservedInboundVideoTrackEvents } from './ObservedInboundVideoTrack';
export type { ObservedOutboundVideoTrack, ObservedOutboundVideoTrackModel, ObservedOutboundVideoTrackEvents } from './ObservedOutboundVideoTrack';
export type { CallSummary, ClientSummary, ClientIssue } from './monitors/CallSummary';
export type { ObserverSinkContext } from './common/types';
export type { SfuServerMonitorMetricsRecord } from './monitors/SfuServerMonitor';
export type { TurnUsageMonitorEvents, TurnUsageMonitor, TurnStats, TurnUsage } from './monitors/TurnUsageMonitor';
export { 
	CallEventType, 
	CallEventReportType, 
	MediaTrackAddedAttachment,
	IceConnectionStateChangedAttachment,
	IceGatheringStateChangedAttachment,
	PeerConnectionStateChangedAttachment,
} from './common/CallEventType';
export { CallMetaType, CallMetaReportType, CallMetaReportPayloads } from './common/CallMetaReports';

import { Observer, ObserverConfig } from './Observer';
export function createObserver(config?: Partial<ObserverConfig>) {
	return Observer.create(config ?? {});
}

import { LogLevel, Logger, forwardLogsTo, setLogLevel } from './common/logger';
export function setupLogs(logLevel: LogLevel, logger: Logger) {
	setLogLevel(logLevel);
	forwardLogsTo(logger);
}
