export type { ObserverConfig, ObserverEvents } from './Observer';

export { Observer } from './Observer';
export type { ObserverStorage } from './storages/ObserverStorage';
export type { StorageProvider } from './storages/StorageProvider';

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

export type { ObservedClient, ObservedClientConfig } from './ObservedClient';
export type { ObservedPeerConnection, ObservedPeerConnectionConfig, ObservedPeerConnectionEvents } from './ObservedPeerConnection';
export type { ObservedInboundTrack, ObservedInboundTrackConfig, ObservedInboundTrackEvents } from './ObservedInboundTrack';
export type { ObservedOutboundTrack, ObservedOutboundTrackConfig, ObservedOutboundTrackEvents } from './ObservedOutboundTrack';

export type { EvaluatorContext, ObserverSinkContext } from './common/types';

import { Observer, ObserverConfig } from './Observer';
export function createObserver(config?: Partial<ObserverConfig>) {
	return Observer.create(config ?? {});
}

import { LogLevel, Logger, forwardLogsTo, setLogLevel } from './common/logger';
export function setupLogs(logLevel: LogLevel, logger: Logger) {
	setLogLevel(logLevel);
	forwardLogsTo(logger);
}
