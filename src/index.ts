export type { ObserverConfig, ObserverEvents } from './Observer';

export type { EvaluatorConfig, EvaluatorProcess } from './Evaluator';

export type { SourcesConfig } from './sources/Sources';

export { Observer } from './Observer';
export type { ObserverReportsEmitter, ObserverSinkProcess } from './sinks/ObserverSink';
export type { ObserverStorage } from './storages/ObserverStorage';
export type { StorageProvider } from './storages/StorageProvider';
export * as Models from './models/Models';

export * as SampleSchema from '@observertc/sample-schemas-js';
export * as ReportSchema from '@observertc/report-schemas-js';

export type { CallEntry } from './entries/CallEntry';
export type { ClientEntry } from './entries/ClientEntry';
export type { PeerConnectionEntry } from './entries/PeerConnectionEntry';
export type { InboundTrackEntry } from './entries/InboundTrackEntry';
export type { OutboundTrackEntry } from './entries/OutboundTrackEntry';
export type { SfuEntry } from './entries/SfuEntry';
export type { SfuTransportEntry } from './entries/SfuTransportEntry';
export type { SfuInboundRtpPadEntry } from './entries/SfuInboundRtpPadEntry';
export type { SfuOutboundRtpPadEntry } from './entries/SfuOutboundRtpPadEntry';
export type { SfuSctpChannelEntry } from './entries/SfuSctpChannelEntry';
export type { GetClientCoordinate, ClientCoordinate } from './evaluators/SetClientsCoordinateEvaluator';

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

export type { ObservedClientSource, ObservedClientSourceConfig } from './sources/ObservedClientSource';

export type { ObservedSfuSource, ObservedSfuSourceConfig } from './sources/ObservedSfuSource';

export type { ObservedCallSource, ObservedCallSourceConfig as ObservedCallConfig } from './sources/ObservedCallSource';

export type { EvaluatorContext, EvaluatorMiddleware, ObserverSinkContext, ObserverSinkMiddleware } from './common/types';

import { Observer, ObserverConfig } from './Observer';
export function createObserver(config?: Partial<ObserverConfig>) {
	return Observer.create(config ?? {});
}
