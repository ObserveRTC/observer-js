import { EventEmitter } from 'events';
import { Observer } from './Observer';
import { SfuSample } from '@observertc/sample-schemas-js';

export type ObservedSfuModel= {
	serviceId: string;
	sfuId: string;
	joined?: number;
};

export type ObservedSfuEvents = {
	update: [],
	close: [],
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
	
	public constructor(
		private readonly _model: ObservedSfuModel,
		public readonly observer: Observer,
		public readonly appData: AppData,
	) {
		super();
		this.setMaxListeners(Infinity);
	}

	public get serviceId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get sfuId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.sfuId!;
	}

	public get joined() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Number(this._model.joined!);
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

	public update(sample: SfuSample) {
		if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
		if (sample.sfuId !== this.sfuId) throw new Error(`Sfu ${this.sfuId} is not the same as sample.sfuId`);

		this._updated = Date.now();
		this.emit('update');
	}
}