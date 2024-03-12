import { EventEmitter } from 'events';
import { SfuOutboundRtpPad } from '@observertc/sample-schemas-js';
import { SfuOutboundRtpPadReport } from '@observertc/report-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';

export type ObservedSfuOutboundRtpPadModel= {
	sfuOutboundRtpPadId: string;
};

export type ObservedSfuOutboundRtpPadEvents = {
	update: [],
	close: [],
};

export declare interface ObservedSfuOutboundRtpPad {
	on<U extends keyof ObservedSfuOutboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuOutboundRtpPadEvents[U]) => void): this;
	off<U extends keyof ObservedSfuOutboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuOutboundRtpPadEvents[U]) => void): this;
	once<U extends keyof ObservedSfuOutboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuOutboundRtpPadEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuOutboundRtpPadEvents>(event: U, ...args: ObservedSfuOutboundRtpPadEvents[U]): boolean;

	update(sample: SfuOutboundRtpPad, timestamp: number): void;
}

export class ObservedSfuOutboundRtpPad extends EventEmitter {
	public readonly created = Date.now();

	public stats?: SfuOutboundRtpPad;
	public marker?: string;
	private _updated = Date.now();
	private _closed = false;
	
	public constructor(
		private readonly _model: ObservedSfuOutboundRtpPadModel,
		public readonly transport: ObservedSfuTransport,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get reports() {
		return this.transport.reports;
	}

	public get serviceId() {
		return this.transport.serviceId;
	}

	public get mediaUnitId() {
		return this.transport.mediaUnitId;
	}

	public get sfuId() {
		return this.transport.sfuId;
	}

	public get sfuTransportId() {
		return this.transport.sfuTransportId;
	}

	public get sfuRtpPadId() {
		return this._model.sfuOutboundRtpPadId;
	}

	public get updated() {
		return this._updated;
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;
		this.emit('close');
	}

	public update(sample: SfuOutboundRtpPad, timestamp: number) {

		const { streamId: sfuStreamId, padId: rtpPadId, sinkId: sfuSinkId, ...reportData } = sample;

		const report: SfuOutboundRtpPadReport = {
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			sfuId: this.sfuId,
			callId: undefined, // TODO: where to get this from?
			sfuStreamId,
			sfuSinkId,
			rtpPadId,
			...reportData,
			timestamp,
			marker: this.marker,
		};

		this.reports.addSfuOutboundRtpPadReport(report);
		this.stats = sample;

		this._updated = Date.now();
		this.emit('update');
	}
}
