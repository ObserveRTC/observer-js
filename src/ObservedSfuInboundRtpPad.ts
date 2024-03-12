import { EventEmitter } from 'events';
import { SfuInboundRtpPad } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';
import { SfuInboundRtpPadReport } from '@observertc/report-schemas-js';

export type ObservedSfuInboundRtpPadModel= {
	sfuInboundRtpPadId: string;
};

export type ObservedSfuInboundRtpPadEvents = {
	update: [],
	close: [],
};

export declare interface ObservedSfuInboundRtpPad {
	on<U extends keyof ObservedSfuInboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuInboundRtpPadEvents[U]) => void): this;
	off<U extends keyof ObservedSfuInboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuInboundRtpPadEvents[U]) => void): this;
	once<U extends keyof ObservedSfuInboundRtpPadEvents>(event: U, listener: (...args: ObservedSfuInboundRtpPadEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuInboundRtpPadEvents>(event: U, ...args: ObservedSfuInboundRtpPadEvents[U]): boolean;

	update(sample: SfuInboundRtpPad, timestamp: number): void;
}

export class ObservedSfuInboundRtpPad extends EventEmitter {
	public readonly created = Date.now();

	public stats?: SfuInboundRtpPad;
	public marker?: string;
	private _updated = Date.now();
	private _closed = false;
	
	public constructor(
		private readonly _model: ObservedSfuInboundRtpPadModel,
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
		return this._model.sfuInboundRtpPadId;
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

	public update(sample: SfuInboundRtpPad, timestamp: number) {

		const { streamId: sfuStreamId, padId: rtpPadId, ...reportData } = sample;

		const report: SfuInboundRtpPadReport = {
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			sfuId: this.sfuId,
			callId: undefined, // TODO: where to get this from?
			sfuStreamId,
			rtpPadId,
			...reportData,
			timestamp,
			marker: this.marker,
		};

		this.reports.addSfuInboundRtpPadReport(report);
		this.stats = sample;

		this._updated = Date.now();
		this.emit('update');
	}
}
