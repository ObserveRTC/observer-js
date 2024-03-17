import { EventEmitter } from 'events';
import { Observer } from './Observer';
import { SfuSample } from '@observertc/sample-schemas-js';
import { ObservedSfuTransport, ObservedSfuTransportModel } from './ObservedSfuTransport';
import { SfuEventReport, SfuExtensionReport } from '@observertc/report-schemas-js';

export type ObservedSfuModel= {
	serviceId: string;
	mediaUnitId: string;
	sfuId: string;
	joined?: number;
};

export type ObservedSfuEvents = {
	update: [{
		elapsedTimeInMs: number;
	}],
	close: [],
	newtransport: [ObservedSfuTransport],
};

export declare interface ObservedSfu<AppData extends Record<string, unknown> = Record<string, unknown>> {
	on<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	off<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	once<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuEvents>(event: U, ...args: ObservedSfuEvents[U]): boolean;

	readonly appData: AppData;
	update(sample: SfuSample): void;
}

export class ObservedSfu<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly created = Date.now();

	private _updated = Date.now();
	private _closed = false;
	private _marker?: string;
	private _timeZoneOffsetInHours?: number;
	private _left?: number;

	private readonly _transports = new Map<string, ObservedSfuTransport>();

	public constructor(
		private readonly _model: ObservedSfuModel,
		public readonly observer: Observer,
		public readonly appData: AppData,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get marker() {
		return this._marker;
	}

	public get reports() {
		return this.observer.reports;
	}

	public get serviceId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get mediaUnitId() {
		return this._model.mediaUnitId;
	}

	public get sfuId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.sfuId!;
	}

	public get joined() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Number(this._model.joined!);
	}

	public get transports(): ReadonlyMap<string, ObservedSfuTransport> {
		return this._transports;
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

		[ ...this._transports.values() ].forEach((transport) => transport.close()); 

		this.emit('close');
	}

	public update(sample: SfuSample) {
		if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
		if (sample.sfuId !== this.sfuId) throw new Error(`Sfu ${this.sfuId} is not the same as sample.sfuId`);

		if (!this._timeZoneOffsetInHours && sample.timeZoneOffsetInHours) {
			this._timeZoneOffsetInHours = sample.timeZoneOffsetInHours;
		}

		const now = Date.now();
		const elapsedTimeInMs = now - this._updated;

		for (const customSfuEvents of sample.customSfuEvents ?? []) {
			const report: SfuEventReport = {
				serviceId: this.serviceId,
				mediaUnitId: this.mediaUnitId,
				sfuId: this.sfuId,
				...customSfuEvents,
				timestamp: sample.timestamp,
				marker: this._marker,
			};

			this.reports.addSfuEventReport(report);
		}

		for (const extensionStats of sample.extensionStats ?? []) {

			const report: SfuExtensionReport = {
				serviceId: this.serviceId,
				mediaUnitId: this.mediaUnitId,
				sfuId: this.sfuId,
				extensionType: extensionStats.type,
				payload: extensionStats.payload,
				timestamp: sample.timestamp,
			};

			this.reports.addSfuExtensionReport(report);
		}

		for (const transport of sample.transports ?? []) {
			const observedSfuTransport = this._transports.get(transport.transportId) ?? this._createTransport({
				sfuTransportId: transport.transportId,
			});

			observedSfuTransport.update(transport, sample.timestamp);
		}

		for (const inboundRtpPad of sample.inboundRtpPads ?? []) {
			const transport = this._transports.get(inboundRtpPad.transportId) ?? this._createTransport({
				sfuTransportId: inboundRtpPad.transportId,
			});

			const observedSfuInboundRtpPad = transport.inboundRtpPads.get(inboundRtpPad.padId) ?? transport.createSfuInboundRtpPad({
				sfuInboundRtpPadId: inboundRtpPad.padId,
			});

			observedSfuInboundRtpPad.update(inboundRtpPad, sample.timestamp);
		}

		for (const outboundRtpPad of sample.outboundRtpPads ?? []) {
			const transport = this._transports.get(outboundRtpPad.transportId) ?? this._createTransport({
				sfuTransportId: outboundRtpPad.transportId,
			});

			const observedSfuOutboundRtpPad = transport.outboundRtpPads.get(outboundRtpPad.padId) ?? transport.createSfuOutboundRtpPad({
				sfuOutboundRtpPadId: outboundRtpPad.padId,
			});

			observedSfuOutboundRtpPad.update(outboundRtpPad, sample.timestamp);
		}

		for (const sctpChannel of sample.sctpChannels ?? []) {
			const transport = this._transports.get(sctpChannel.transportId) ?? this._createTransport({
				sfuTransportId: sctpChannel.transportId,
			});

			const observedSfuSctpChannel = transport.sctpChannels.get(sctpChannel.channelId) ?? transport.createSfuSctpChannel({
				sfuSctpChannelId: sctpChannel.channelId,
			});

			observedSfuSctpChannel.update(sctpChannel, sample.timestamp);
		}

		this._updated = now;
		this.emit('update', {
			elapsedTimeInMs,
		});
	}

	private _createTransport(model: ObservedSfuTransportModel) {
		const result = new ObservedSfuTransport(model, this);

		result.once('close', () => {
			this._transports.delete(model.sfuTransportId);
		});
		this._transports.set(model.sfuTransportId, result);
		
		this.emit('newtransport', result);
		
		return result;
	}
}
