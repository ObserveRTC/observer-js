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
import { ObserverSinkContext } from '../common/types';
import { Middleware } from '../middlewares/Middleware';
import { createProcessor, Processor } from '../middlewares/Processor';
import { logger } from '../middlewares/VisitObservedCallsMiddleware';

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
};

export type SinkConfig = Record<string, unknown>;
export type ObserverSinkProcess = (observerSinkContext: ObserverSinkContext) => Promise<void>;

export interface ObserverReportsEmitter {
	on<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
	off<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
	once<K extends keyof SinkEventsMap>(event: K, listener: (reports: SinkEventsMap[K]) => void): this;
}

export class SinkImpl implements ReportsCollector, ObserverReportsEmitter {
	private _index = 0;
	private _processes = new Map<number, Promise<void>>();
	private _customProcesses = new Map<ObserverSinkProcess, Middleware<ObserverSinkContext>>();
	private readonly _processor: Processor<ObserverSinkContext>;
	
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

	public constructor(public readonly config: SinkConfig) {
		this._processor = createProcessor();
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

	public getCallEventReports(): CallEventReport[] {
		return this._callEventReports;
	}

	public getClientExtensionReports(): ClientExtensionReport[] {
		return this._clientExtensionReports;
	}

	public getSfuEventReports(): SfuEventReport[] {
		return this._sfuEventReports;
	}

	public getSfuExtensionReports(): SfuExtensionReport[] {
		return this._sfuExtensionReports;
	}

	public addProcess(process: ObserverSinkProcess) {
		const middleware: Middleware<ObserverSinkContext> = async (context, next) => {
			await process(context);
			if (next) await next(context);
		};

		this._customProcesses.set(process, middleware);
		this._processor.addMiddleware(middleware);
	}

	public removeProcess(process: ObserverSinkProcess) {
		const middleware = this._customProcesses.get(process);

		if (!middleware) {
			return;
		}
		this._customProcesses.delete(process);
		this._processor.removeMiddleware(middleware);
	}

	private async _process(context: ObserverSinkContext): Promise<void> {
		if (this._processor.getSize() < 1) {
			// no process to execute
			return;
		}
		if (this._processes.has(this._index)) {
			logger.warn('The sink process has been called while the previous process has not yet completed. This may indicate that the observer is attempting to process more reports than it can handle.');
		}

		const actualBlockingPoint = this._processes.get(this._index) ?? Promise.resolve();
		const index = ++this._index;
		const result = new Promise<void>((resolve, reject) => {
			actualBlockingPoint.then(() => {
				this._processor.use(context)
					.then(() => resolve())
					.catch((err) => reject(err));
			});
		});
		const nextBlockingPoint = new Promise<void>((resolve) => {
			result.then(() => {
				this._processes.delete(index);
				resolve();
			}).catch(() => {
				this._processes.delete(index);
				resolve();
			});
		});

		this._processes.set(index, nextBlockingPoint);
		
		return result;
	}

	public emit(): number {
		let result = 0;
		const checkAndEmit = (eventName: keyof SinkEventsMap, reports: any[]) => {
			if (reports.length > 0) {
				this._emit(eventName, { reports });
				result += reports.length;
			}
		};
		
		const context = this._createObserverSinkContext();

		this._process(context).catch((err) => {
			logger.error('Error occurred while processing reports', err);
		});

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
