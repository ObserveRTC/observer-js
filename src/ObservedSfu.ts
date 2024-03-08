import { EventEmitter } from 'events';
import * as Models from './models/Models';
import { Observer } from './Observer';
import { createSingleExecutor } from './common/SingleExecutor';
import { SfuSample } from '@observertc/sample-schemas-js';

export type ObservedSfuConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	serviceId: string;
	sfuId: string;
	joined?: number;
	appData: AppData;
};

export type ObservedSfuEvents = {
	update: [],
	close: [],
};

export declare interface ObservedSfu {
	on<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	off<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	once<U extends keyof ObservedSfuEvents>(event: U, listener: (...args: ObservedSfuEvents[U]) => void): this;
	emit<U extends keyof ObservedSfuEvents>(event: U, ...args: ObservedSfuEvents[U]): boolean;
}

export class ObservedSfu<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public static async create<T extends Record<string, unknown> = Record<string, unknown>>(
		config: ObservedSfuConfig<T>, 
		observer: Observer,
		// reportsCollector: ReportsCollector,
	) {
		const model = new Models.Sfu({
			serviceId: config.serviceId,
			sfuId: config.sfuId,
			sfuTransportIds: [],
			joined: BigInt(config.joined ?? Date.now()),
		});
		const result = new ObservedSfu(
			model,
			observer,
			config.appData,
		);

		const alreadyInserted = await observer.storage.sfuStorage.insert(config.sfuId, model);

		if (alreadyInserted) throw new Error(`Sfu with id ${config.sfuId} already exists`);

		return result;
	}

	private _updated = Date.now();
	private readonly _execute = createSingleExecutor();
	private _closed = false;
	
	private constructor(
		private readonly _model: Models.Sfu,
		public readonly observer: Observer,
		public readonly appData: AppData,
	) {
		super();
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

	public get closed() {
		return this._closed;
	}

	public close() {
		if (this._closed) return;
		this._closed = true;
		this.emit('close');
	}

	public async update(sample: SfuSample) {
		if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
		if (sample.sfuId !== this.sfuId) throw new Error(`Sfu ${this.sfuId} is not the same as sample.sfuId`);
		
		return this._execute(async () => {
			if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
			await this._save();
			this.emit('update');
		});
	}

	private async _save() {
		if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
		
		return this._execute(async () => {
			if (this._closed) throw new Error(`Sfu ${this.sfuId} is closed`);
			await this.observer.storage.sfuStorage.set(this.sfuId, this._model);
		});		
	}
	
}