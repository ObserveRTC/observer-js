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
import { ObserverSinkContext } from './common/types';

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
	'peer-connection-transport': {
		reports: PeerConnectionTransportReport[];
	};
	'inbound-audio-track': {
		reports: InboundAudioTrackReport[];
	};
	'inbound-video-track': {
		reports: InboundVideoTrackReport[];
	};
	'observer-event': { 
		reports: ObserverEventReport[] 
	};
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
	'reports': ObserverSinkContext;
	'newreport': number;
};

export type ObserverSinkProcess = (observerSinkContext: ObserverSinkContext) => Promise<void>;

export class ReportsCollector {
	private _collectedReports = 0;
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

	public constructor() {
		// empty
	}

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
		this._emit('newreport', ++this._collectedReports);
	}

	public addCallMetaReport(report: CallMetaReport) {
		this._callMetaReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addClientDataChannelReport(report: ClientDataChannelReport) {
		this._clientDataChannelReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addClientExtensionReport(report: ClientExtensionReport) {
		this._clientExtensionReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addIceCandidatePairReport(report: IceCandidatePairReport) {
		this._iceCandidatePairReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addInboundAudioTrackReport(report: InboundAudioTrackReport) {
		this._inboundAudioTrackReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addInboundVideoTrackReport(report: InboundVideoTrackReport) {
		this._inboundVideoTrackReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addPeerConnectionTransportReports(report: PeerConnectionTransportReport) {
		this._peerConnectionTransportReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addObserverEventReport(report: ObserverEventReport) {
		this._observerEventReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addOutboundAudioTrackReport(report: OutboundAudioTrackReport) {
		this._outboundAudioTrackReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addOutboundVideoTrackReport(report: OutboundVideoTrackReport) {
		this._outboundVideoTrackReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuEventReport(report: SfuEventReport) {
		this._sfuEventReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuExtensionReport(report: SfuExtensionReport) {
		this._sfuExtensionReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuInboundRtpPadReport(report: SfuInboundRtpPadReport) {
		this._sfuInboundRtpPadReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuOutboundRtpPadReport(report: SfuOutboundRtpPadReport) {
		this._sfuOutboundRtpPadReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuSctpStreamReport(report: SfuSctpStreamReport) {
		this._sfuSctpStreamReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuTransportReport(report: SFUTransportReport) {
		this._sfuTransportReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public addSfuMetaReport(report: SfuMetaReport) {
		this._sfuMetaReports.push(report);
		this._emit('newreport', ++this._collectedReports);
	}

	public emit(): number {
		let result = 0;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const checkAndEmit = (eventName: keyof SinkEventsMap, reports: any[]) => {
			if (0 < reports.length) {
				this._emit(eventName, { reports });
				result += reports.length;
			}
		};
		
		const context = this._createObserverSinkContext();

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

		this._emit('reports', context);
		this._collectedReports = 0;
		
		return result;
	}

	private _emit<K extends keyof SinkEventsMap>(event: K, reports: SinkEventsMap[K]): boolean {
		return this._emitter.emit(event, reports);
	}

	private _createObserverSinkContext(): ObserverSinkContext {
		const callEventReports = [ ...this._callEventReports ];
		const callMetaReports = [ ...this._callMetaReports ];
		const clientDataChannelReports = [ ...this._clientDataChannelReports ];
		const clientExtensionReports = [ ...this._clientExtensionReports ];
		const iceCandidatePairReports = [ ...this._iceCandidatePairReports ];
		const inboundAudioTrackReports = [ ...this._inboundAudioTrackReports ];
		const inboundVideoTrackReports = [ ...this._inboundVideoTrackReports ];
		const peerConnectionTransportReports = [ ...this._peerConnectionTransportReports ];
		const observerEventReports = [ ...this._observerEventReports ];
		const outboundAudioTrackReports = [ ...this._outboundAudioTrackReports ];
		const outboundVideoTrackReports = [ ...this._outboundVideoTrackReports ];
		const sfuEventReports = [ ...this._sfuEventReports ];
		const sfuExtensionReports = [ ...this._sfuExtensionReports ];
		const sfuInboundRtpPadReports = [ ...this._sfuInboundRtpPadReports ];
		const sfuOutboundRtpPadReports = [ ...this._sfuOutboundRtpPadReports ];
		const sfuSctpStreamReports = [ ...this._sfuSctpStreamReports ];
		const sfuTransportReports = [ ...this._sfuTransportReports ];
		const sfuMetaReports = [ ...this._sfuMetaReports ];

		return {
			callEventReports,
			callMetaReports,
			clientDataChannelReports,
			clientExtensionReports,
			iceCandidatePairReports,
			inboundAudioTrackReports,
			inboundVideoTrackReports,
			peerConnectionTransportReports,
			observerEventReports,
			outboundAudioTrackReports,
			outboundVideoTrackReports,
			sfuEventReports,
			sfuExtensionReports,
			sfuInboundRtpPadReports,
			sfuOutboundRtpPadReports,
			sfuSctpStreamReports,
			sfuTransportReports,
			sfuMetaReports,
		};
	}
}
