import {
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

export type MediaKind = 'audio' | 'video';
export type SupportedVideoCodecType = 'vp8' | 'vp9' | 'h264' | 'h265';

// export type EvaluatorMiddleware = Middleware<EvaluatorContext>;

export interface ObserverSinkContext {
	readonly callEventReports: CallEventReport[];
	readonly callMetaReports: CallMetaReport[];
	readonly clientDataChannelReports: ClientDataChannelReport[];
	readonly clientExtensionReports: ClientExtensionReport[];
	readonly iceCandidatePairReports: IceCandidatePairReport[];
	readonly inboundAudioTrackReports: InboundAudioTrackReport[];
	readonly inboundVideoTrackReports: InboundVideoTrackReport[];
	readonly peerConnectionTransportReports: PeerConnectionTransportReport[];
	readonly observerEventReports: ObserverEventReport[];
	readonly outboundAudioTrackReports: OutboundAudioTrackReport[];
	readonly outboundVideoTrackReports: OutboundVideoTrackReport[];
	readonly sfuEventReports: SfuEventReport[];
	readonly sfuExtensionReports: SfuExtensionReport[];
	readonly sfuInboundRtpPadReports: SfuInboundRtpPadReport[];
	readonly sfuOutboundRtpPadReports: SfuOutboundRtpPadReport[];
	readonly sfuSctpStreamReports: SfuSctpStreamReport[];
	readonly sfuTransportReports: SFUTransportReport[];
	readonly sfuMetaReports: SfuMetaReport[];
}
