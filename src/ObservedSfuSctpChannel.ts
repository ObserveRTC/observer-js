import { EventEmitter } from 'events';
import { SfuSctpChannel } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport } from './ObservedSfuTransport';
import { SfuSctpStreamReport } from '@observertc/report-schemas-js';

export type ObservedSfuSctpChannelModel= {
	sfuSctpChannelId: string;
};

export type ObservedSfuSctpChannelEvents = {
	update: [],
	close: [],
};

export declare interface ObservedSfuSctpChannel {
	on<U extends keyof ObservedSfuSctpChannelEvents>(event: U, listener: (...args: ObservedSfuSctpChannelEvents[U]) => void): this;
	off<U extends keyof ObservedSfuSctpChannelEvents>(event: U, listener: (...args: ObservedSfuSctpChannelEvents[U]) => void): this;
	once<U extends keyof ObservedSfuSctpChannelEvents>(event: U, listener: (...args: ObservedSfuSctpChannelEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuSctpChannelEvents>(event: U, ...args: ObservedSfuSctpChannelEvents[U]): boolean;

	update(sample: SfuSctpChannel, timestamp: number): void;
}

export class ObservedSfuSctpChannel extends EventEmitter {
	public readonly created = Date.now();

	public stats?: SfuSctpChannel;
	public marker?: string;
	private _updated = Date.now();
	private _closed = false;
	
	public constructor(
		private readonly _model: ObservedSfuSctpChannelModel,
		public readonly transport: ObservedSfuTransport,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get serviceId() {
		return this.transport.serviceId;
	}

	public get sfuId() {
		return this.transport.sfuId;
	}

	public get mediaUnitId() {
		return this.transport.mediaUnitId;
	}

	public get sfuTransportId() {
		return this.transport.sfuTransportId;
	}

	public get sfuSctpChannelId() {
		return this._model.sfuSctpChannelId;
	}

	public get reports() {
		return this.transport.reports;
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

	public update(sample: SfuSctpChannel, timestamp: number) {

		const report: SfuSctpStreamReport = {
			serviceId: this.serviceId,
			mediaUnitId: this.mediaUnitId,
			sfuId: this.sfuId,
			callId: undefined, // TODO: where to get this from?
			roomId: undefined, // TODO: where to get this from?
			...sample,
			timestamp,
			marker: this.marker,
		};

		this.reports.addSfuTransportReport(report);
		this.stats = sample;

		this._updated = Date.now();
		this.emit('update');
	}
}
