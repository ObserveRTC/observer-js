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
import { EventEmitter } from 'events';
import { ReportsCollector } from '../common/ReportsCollector';

export type SinkEventsMap = {
	'call-event': {
		reports: CallEventReport[];
	};
	'call-meta': {
		reports: CallMetaReport[];
	};
	'client-data-channel': {
		reports: ClientDataChannelReport[];
	};
	'client-extension': {
		reports: ClientExtensionReport[];
	};
	'ice-candidate-pair': {
		reports: IceCandidatePairReport[];
	};
	'inbound-audio-track': {
		reports: InboundAudioTrackReport[];
	};
	'inbound-video-track': {
		reports: InboundVideoTrackReport[];
	};
	'peer-connection-transport': {
		reports: PeerConnectionTransportReport[];
	};
	'observer-event': { reports: ObserverEventReport[] };
	'outbound-audio-track': {
		reports: OutboundAudioTrackReport[];
	};
	'outbound-video-track': {
		reports: OutboundVideoTrackReport[];
	};
	'sfu-event': {
		reports: SfuEventReport[];
	};
	'sfu-extension': {
		reports: SfuExtensionReport[];
	};
	'sfu-inbound-rtp-pad': {
		reports: SfuInboundRtpPadReport[];
	};
	'sfu-outbound-rtp-pad': {
		reports: SfuOutboundRtpPadReport[];
	};
	'sfu-sctp-stream': {
		reports: SfuSctpStreamReport[];
	};
	'sfu-transport': {
		reports: SFUTransportReport[];
	};
	'sfu-meta': {
		reports: SfuMetaReport[];
	};
};

export type SinkConfig = {};

export interface ObserverSink {
	on<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
	off<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
	once<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
}

export class SinkImpl implements ReportsCollector, ObserverSink {
	private _emitter = new EventEmitter();
	private _callEventReports: CallEventReport[] = [];
	private _callMetaReports: CallMetaReport[] = [];
	private _clientDataChannelReports: ClientDataChannelReport[] = [];
	private _clientExtensionReports: ClientExtensionReport[] = [];
	private _iceCandidatePairReports: IceCandidatePairReport[] = [];
	private _inboundAudioTrackReports: InboundAudioTrackReport[] = [];
	private _inboundVideoTrackReports: InboundVideoTrackReport[] = [];
	private _peerConnectionTransportReports: PeerConnectionTransportReport[] = [];
	private _observerEventReports: ObserverEventReport[] = [];
	private _outboundAudioTrackReports: OutboundAudioTrackReport[] = [];
	private _outboundVideoTrackReports: OutboundVideoTrackReport[] = [];
	private _sfuEventReports: SfuEventReport[] = [];
	private _sfuExtensionReports: SfuExtensionReport[] = [];
	private _sfuInboundRtpPadReports: SfuInboundRtpPadReport[] = [];
	private _sfuOutboundRtpPadReports: SfuOutboundRtpPadReport[] = [];
	private _sfuSctpStreamReports: SfuSctpStreamReport[] = [];
	private _sfuTransportReports: SFUTransportReport[] = [];
	private _sfuMetaReports: SfuMetaReport[] = [];

	public constructor(public readonly config: SinkConfig) {}

	public on<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this {
		this._emitter.addListener(event, listener);
		return this;
	}

	public off<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this {
		this._emitter.removeListener(event, listener);
		return this;
	}

	public once<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this {
		this._emitter.once(event, listener);
		return this;
	}

	public addCallEventReport(report: CallEventReport) {
		this._callEventReports.push(report);
	}

	public addCallMetaReport(report: CallMetaReport) {
		this._callMetaReports.push(report);
	}

	public addClientDataChannelReport(report: ClientDataChannelReport) {
		this._clientDataChannelReports.push(report);
	}

	public addClientExtensionReport(report: ClientExtensionReport) {
		this._clientExtensionReports.push(report);
	}

	public addIceCandidatePairReport(report: IceCandidatePairReport) {
		this._iceCandidatePairReports.push(report);
	}

	public addInboundAudioTrackReport(report: InboundAudioTrackReport) {
		this._inboundAudioTrackReports.push(report);
	}

	public addInboundVideoTrackReport(report: InboundVideoTrackReport) {
		this._inboundVideoTrackReports.push(report);
	}

	public addPeerConnectionTransportReports(report: PeerConnectionTransportReport) {
		this._peerConnectionTransportReports.push(report);
	}

	public addObserverEventReport(report: ObserverEventReport) {
		this._observerEventReports.push(report);
	}

	public addOutboundAudioTrackReport(report: OutboundAudioTrackReport) {
		this._outboundAudioTrackReports.push(report);
	}

	public addOutboundVideoTrackReport(report: OutboundVideoTrackReport) {
		this._outboundVideoTrackReports.push(report);
	}

	public addSfuEventReport(report: SfuEventReport) {
		this._sfuEventReports.push(report);
	}

	public addSfuExtensionReport(report: SfuExtensionReport) {
		this._sfuExtensionReports.push(report);
	}

	public addSfuInboundRtpPadReport(report: SfuInboundRtpPadReport) {
		this._sfuInboundRtpPadReports.push(report);
	}

	public addSfuOutboundRtpPadReport(report: SfuOutboundRtpPadReport) {
		this._sfuOutboundRtpPadReports.push(report);
	}

	public addSfuSctpStreamReport(report: SfuSctpStreamReport) {
		this._sfuSctpStreamReports.push(report);
	}

	public addSfuTransportReport(report: SFUTransportReport) {
		this._sfuTransportReports.push(report);
	}

	public addSfuMetaReport(report: SfuMetaReport) {
		this._sfuMetaReports.push(report);
	}

	public emit(): number {
		let result = 0;
		const checkAndEmit = (eventName: keyof SinkEventsMap, reports: any[]) => {
			if (reports.length > 0) {
				this._emit(eventName, { reports });
				result += reports.length;
			}
		};

		checkAndEmit('call-event', this._callEventReports);
		this._callEventReports = [];

		checkAndEmit('call-meta', this._callMetaReports);
		this._callMetaReports = [];

		checkAndEmit('client-data-channel', this._clientDataChannelReports);
		this._clientDataChannelReports = [];

		checkAndEmit('client-extension', this._clientExtensionReports);
		this._clientExtensionReports = [];

		checkAndEmit('ice-candidate-pair', this._iceCandidatePairReports);
		this._iceCandidatePairReports = [];

		checkAndEmit('inbound-audio-track', this._inboundAudioTrackReports);
		this._inboundAudioTrackReports = [];

		checkAndEmit('inbound-video-track', this._inboundVideoTrackReports);
		this._inboundVideoTrackReports = [];

		checkAndEmit('peer-connection-transport', this._peerConnectionTransportReports);
		this._peerConnectionTransportReports = [];

		checkAndEmit('observer-event', this._observerEventReports);
		this._observerEventReports = [];

		checkAndEmit('outbound-audio-track', this._outboundAudioTrackReports);
		this._outboundAudioTrackReports = [];

		checkAndEmit('outbound-video-track', this._outboundVideoTrackReports);
		this._outboundVideoTrackReports = [];

		checkAndEmit('sfu-event', this._sfuEventReports);
		this._sfuEventReports = [];

		checkAndEmit('sfu-extension', this._sfuExtensionReports);
		this._sfuExtensionReports = [];

		checkAndEmit('sfu-inbound-rtp-pad', this._sfuInboundRtpPadReports);
		this._sfuInboundRtpPadReports = [];

		checkAndEmit('sfu-outbound-rtp-pad', this._sfuOutboundRtpPadReports);
		this._sfuOutboundRtpPadReports = [];

		checkAndEmit('sfu-sctp-stream', this._sfuSctpStreamReports);
		this._sfuSctpStreamReports = [];

		checkAndEmit('sfu-transport', this._sfuTransportReports);
		this._sfuTransportReports = [];

		checkAndEmit('sfu-meta', this._sfuMetaReports);
		this._sfuMetaReports = [];

		return result;
	}

	private _emit<K extends keyof SinkEventsMap>(event: K, reports: SinkEventsMap[K]): boolean {
		return this._emitter.emit(event, reports);
	}
}
