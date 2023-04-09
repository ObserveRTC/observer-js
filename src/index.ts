
export type { 
	ObserverConfig,
} from './Observer';

export type {
	EvaluatorConfig,
	EvaluatorProcess
} from './Evaluator';

export type {
	SourcesConfig
} from './sources/Sources';

export { Observer } from './Observer';
export type { ObserverSink } from './sinks/ObserverSink';
export type { ObserverStorage } from './storages/ObserverStorage';
export type { StorageProvider } from './storages/StorageProvider';
export * as Models from './models/Models';

// export * as SampleSchema from '@observertc/sample-schemas-js';
// export * as ReportSchema from '@observertc/report-schemas-js';

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
} from '@observertc/sample-schemas-js'

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
} from '@observertc/report-schemas-js'

export type { 
	ObservedClientSource, 
	ObservedClientSourceConfig 
} from './sources/ObservedClientSource';

export type { 
	ObservedCallSource, 
	ObservedCallConfig 
} from './sources/ObservedCallSource';


export type { 
	EvaluatorContext,
	EvaluatorMiddleware,
} from './common/types'

import { Observer, ObserverConfig } from './Observer';
export function createObserver(config?: Partial<ObserverConfig>) {
	return Observer.create(config ?? {});
}
