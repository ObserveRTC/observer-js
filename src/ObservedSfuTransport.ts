import { EventEmitter } from 'events';
import { SfuTransport } from '@observertc/sample-schemas-js';
import { ObservedSfu } from './ObservedSfu';
import { SFUTransportReport } from '@observertc/report-schemas-js';
import { ObservedSfuInboundRtpPad, ObservedSfuInboundRtpPadModel } from './ObservedSfuInboundRtpPad';
import { ObservedSfuOutboundRtpPad, ObservedSfuOutboundRtpPadModel } from './ObservedSfuOutboundRtpPad';
import { ObservedSfuSctpChannel, ObservedSfuSctpChannelModel } from './ObservedSfuSctpChannel';

export type ObservedSfuTransportModel= {
	sfuTransportId: string;
};

export type ObservedSfuTransportEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	close: [],
	newsfuoutboundrtppad: [ObservedSfuOutboundRtpPad],
	newsfuinboundrtppad: [ObservedSfuInboundRtpPad],
	newsfusctpchannel: [ObservedSfuSctpChannel],
};

export declare interface ObservedSfuTransport {
	on<U extends keyof ObservedSfuTransportEvents>(event: U, listener: (...args: ObservedSfuTransportEvents[U]) => void): this;
	off<U extends keyof ObservedSfuTransportEvents>(event: U, listener: (...args: ObservedSfuTransportEvents[U]) => void): this;
	once<U extends keyof ObservedSfuTransportEvents>(event: U, listener: (...args: ObservedSfuTransportEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuTransportEvents>(event: U, ...args: ObservedSfuTransportEvents[U]): boolean;

	update(sample: SfuTransport, timestamp: number): void;
}

export class ObservedSfuTransport extends EventEmitter {
	public readonly created = Date.now();

	public stats?: SfuTransport;
	private _updated = Date.now();
	private _closed = false;
	private _marker?: string;
	
	private readonly _inboundRtpPads = new Map<string, ObservedSfuInboundRtpPad>();
	private readonly _outboundRtpPads = new Map<string, ObservedSfuOutboundRtpPad>();
	private readonly _sctpChannels = new Map<string, ObservedSfuSctpChannel>();

	public constructor(
		private readonly _model: ObservedSfuTransportModel,
		public readonly sfu: ObservedSfu,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get inboundRtpPads(): ReadonlyMap<string, ObservedSfuInboundRtpPad> {
		return this._inboundRtpPads;
	}

	public get outboundRtpPads(): ReadonlyMap<string, ObservedSfuOutboundRtpPad> {
		return this._outboundRtpPads;
	}

	public get sctpChannels(): ReadonlyMap<string, ObservedSfuSctpChannel> {
		return this._sctpChannels;
	}

	public get serviceId() {
		return this.sfu.serviceId;
	}

	public get mediaUnitId() {
		return this.sfu.mediaUnitId;
	}

	public get sfuId() {
		return this.sfu.sfuId;
	}

	public get sfuTransportId() {
		return this._model.sfuTransportId;
	}

	public get reports() {
		return this.sfu.reports;
	}

	public get updated() {
		return this._updated;
	}

	public get marker() {
		return this._marker;
	}

	public set marker(value: string | undefined) {
		this._marker = value;
		this._inboundRtpPads.forEach((pad) => (pad.marker = value));
		this._outboundRtpPads.forEach((pad) => (pad.marker = value));
		this._sctpChannels.forEach((channel) => (channel.marker = value));
	}

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;

		[ ...this._inboundRtpPads.values() ].forEach((pad) => pad.close());
		[ ...this._outboundRtpPads.values() ].forEach((pad) => pad.close());
		[ ...this._sctpChannels.values() ].forEach((channel) => channel.close());

		this.emit('close');
	}

	public update(sample: SfuTransport, timestamp: number) {
		const now = Date.now();
		const elapsedTimeInMs = now - this._updated;

		const report: SFUTransportReport = {
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

		this._updated = now;
		this.emit('update', {
			elapsedTimeInMs,
		});
	}

	public createSfuOutboundRtpPad(model: ObservedSfuOutboundRtpPadModel) {
		if (this._closed) throw new Error('Cannot create SfuOutboundRtpPad on closed SfuTransport');
		if (this._inboundRtpPads.has(model.sfuOutboundRtpPadId)) throw new Error(`SfuOutboundRtpPad with id ${model.sfuOutboundRtpPadId} already exists`);

		const result = new ObservedSfuOutboundRtpPad(model, this);

		result.once('close', () => {
			this._outboundRtpPads.delete(model.sfuOutboundRtpPadId);
		});
		this._outboundRtpPads.set(model.sfuOutboundRtpPadId, result);

		this.emit('newsfuoutboundrtppad', result);

		return result;
	}

	public createSfuInboundRtpPad(model: ObservedSfuInboundRtpPadModel) {
		if (this._closed) throw new Error('Cannot create SfuInboundRtpPad on closed SfuTransport');
		if (this._inboundRtpPads.has(model.sfuInboundRtpPadId)) throw new Error(`SfuInboundRtpPad with id ${model.sfuInboundRtpPadId} already exists`);

		const result = new ObservedSfuInboundRtpPad(model, this);

		result.once('close', () => {
			this._inboundRtpPads.delete(model.sfuInboundRtpPadId);
		});
		this._inboundRtpPads.set(model.sfuInboundRtpPadId, result);

		this.emit('newsfuinboundrtppad', result);

		return result;
	}

	public createSfuSctpChannel(model: ObservedSfuSctpChannelModel) {
		if (this._closed) throw new Error('Cannot create SfuSctpChannel on closed SfuTransport');
		if (this._sctpChannels.has(model.sfuSctpChannelId)) throw new Error(`SfuSctpChannel with id ${model.sfuSctpChannelId} already exists`);

		const result = new ObservedSfuSctpChannel(model, this);

		result.once('close', () => {
			this._sctpChannels.delete(model.sfuSctpChannelId);
		});
		this._sctpChannels.set(model.sfuSctpChannelId, result);

		this.emit('newsfusctpchannel', result);

		return result;
	}
}
