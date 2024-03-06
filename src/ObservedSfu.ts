import { EventEmitter } from 'events';
import * as Models from './models/Models';
import { Observer } from './Observer';

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
			config.appData,
		);

		const alreadyInserted = await observer.storage.sfuStorage.insert(config.sfuId, model);

		if (alreadyInserted) throw new Error(`Sfu with id ${config.sfuId} already exists`);

		return result;
	}
	
	private constructor(
		private readonly _model: Models.Sfu,
		public readonly appData: AppData,
	) {
		super();
	}
	
}