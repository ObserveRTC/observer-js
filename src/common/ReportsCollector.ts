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

// export interface ReportsCollector {
// 	addCallEventReport(report: CallEventReport): void;
// 	addCallMetaReport(report: CallMetaReport): void;
// 	addClientDataChannelReport(report: ClientDataChannelReport): void;
// 	addClientExtensionReport(report: ClientExtensionReport): void;
// 	addIceCandidatePairReport(report: IceCandidatePairReport): void;
// 	addInboundAudioTrackReport(report: InboundAudioTrackReport): void;
// 	addInboundVideoTrackReport(report: InboundVideoTrackReport): void;
// 	addPeerConnectionTransportReports(report: PeerConnectionTransportReport): void;
// 	addObserverEventReport(report: ObserverEventReport): void;
// 	addOutboundAudioTrackReport(report: OutboundAudioTrackReport): void;
// 	addOutboundVideoTrackReport(report: OutboundVideoTrackReport): void;
// 	addSfuEventReport(report: SfuEventReport): void;
// 	addSfuExtensionReport(report: SfuExtensionReport): void;
// 	addSfuInboundRtpPadReport(report: SfuInboundRtpPadReport): void;
// 	addSfuOutboundRtpPadReport(report: SfuOutboundRtpPadReport): void;
// 	addSfuSctpStreamReport(report: SfuSctpStreamReport): void;
// 	addSfuTransportReport(report: SFUTransportReport): void;
// 	addSfuMetaReport(report: SfuMetaReport): void;

// 	getCallEventReports(): CallEventReport[];
// 	getClientExtensionReports(): ClientExtensionReport[];
// 	getSfuEventReports(): SfuEventReport[];
// 	getSfuExtensionReports(): SfuExtensionReport[];
// }

export type ObservedReports = ReturnType<typeof createObservedReports>;

export function createObservedReports() {
	return {
		callEventReports: [] as CallEventReport[],
		callMetaReports: [] as CallMetaReport[],
		clientDataChannelReports: [] as ClientDataChannelReport[],
		clientExtensionReports: [] as ClientExtensionReport[],
		iceCandidatePairReports: [] as IceCandidatePairReport[],
		inboundAudioTrackReports: [] as InboundAudioTrackReport[],
		inboundVideoTrackReports: [] as InboundVideoTrackReport[],
		observerEventReports: [] as ObserverEventReport[],
		outboundAudioTrackReports: [] as OutboundAudioTrackReport[],
		outboundVideoTrackReports: [] as OutboundVideoTrackReport[],
		peerConnectionTransportReports: [] as PeerConnectionTransportReport[],
		sfuEventReports: [] as SfuEventReport[],
		sfuExtensionReports: [] as SfuExtensionReport[],
		sfuInboundRtpPadReports: [] as SfuInboundRtpPadReport[],
		sfuMetaReports: [] as SfuMetaReport[],
		sfuOutboundRtpPadReports: [] as SfuOutboundRtpPadReport[],
		sfuSctpStreamReports: [] as SfuSctpStreamReport[],
		sfuTransportReports: [] as SFUTransportReport[],
	};
}
