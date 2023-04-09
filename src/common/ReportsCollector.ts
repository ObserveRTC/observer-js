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
	SFUTransportReport
} from '@observertc/report-schemas-js';



export interface ReportsCollector {
	addCallEventReport(report: CallEventReport): void;
	addCallMetaReport(report: CallMetaReport): void;
	addClientDataChannelReport(report: ClientDataChannelReport): void;
	addClientExtensionReport(report: ClientExtensionReport): void;
	addIceCandidatePairReport(report: IceCandidatePairReport): void;
	addInboundAudioTrackReport(report: InboundAudioTrackReport): void;
	addInboundVideoTrackReport(report: InboundVideoTrackReport): void;
	addPeerConnectionTransportReports(report: PeerConnectionTransportReport): void;
	addObserverEventReport(report: ObserverEventReport): void;
	addOutboundAudioTrackReport(report: OutboundAudioTrackReport): void;
	addOutboundVideoTrackReport(report: OutboundVideoTrackReport): void;
	addSfuEventReport(report: SfuEventReport): void;
	addSfuExtensionReport(report: SfuExtensionReport): void;
	addSfuInboundRtpPadReport(report: SfuInboundRtpPadReport): void;
	addSfuOutboundRtpPadReport(report: SfuOutboundRtpPadReport): void;
	addSfuSctpStreamReport(report: SfuSctpStreamReport): void;
	addSfuTransportReport(report: SFUTransportReport): void;
	addSfuMetaReport(report: SfuMetaReport): void;
}
