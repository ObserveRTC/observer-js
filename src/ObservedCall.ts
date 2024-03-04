import { EventEmitter } from 'events';
import { StorageProvider } from './storages/StorageProvider';
import * as Models from './models/Models';
import { ObservedClient, ObservedClientConfig } from './ObservedClient';
import { ReportsCollector } from './ReportsCollector';
import { createSingleExecutor } from './common/SingleExecutor';
import { PartialBy } from './common/utils';

export type ObservedCallConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	serviceId: string;
	roomId: string;
	callId: string;
	defaultMediaUnitId: string;
	started: number,
	appData: AppData,
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
	close: [],
}

export declare interface ObservedCall {
	on<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	off<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	once<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	emit<U extends keyof ObservedCallEvents>(event: U, ...args: ObservedCallEvents[U]): boolean;
}

export class ObservedCall<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public static async create<T extends Record<string, unknown> = Record<string, unknown>>(
		config: ObservedCallConfig<T>, 
		storageProvider: StorageProvider,
		reportsCollector: ReportsCollector,
	) {
		const model = new Models.Call({
			roomId: config.roomId,
			serviceId: config.serviceId,
			callId: config.callId,
			clientIds: [],
			started: BigInt(config.started ?? Date.now()),
		});
		const result = new ObservedCall(
			model, 
			storageProvider, 
			reportsCollector, 
			config.appData,
			config.defaultMediaUnitId,
		);

		const alreadyInserted = await storageProvider.callStorage.insert(config.callId, model);

		if (alreadyInserted) throw new Error(`Call with id ${config.callId} already exists`);

		return result;
	}

	private readonly _execute = createSingleExecutor();
	private readonly _creatingClients = new Map<string, Promise<ObservedClient>>();
	private readonly _clients = new Map<string, ObservedClient>();
	
	private _closed = false;
	private _ended?: number;

	private constructor(
		private readonly _model: Models.Call,
		private readonly _storageProvider: StorageProvider,
		public readonly reports: ReportsCollector,
		public readonly appData: AppData,
		private readonly _defaultMediaUnitId: string,
	) {
		super();
	}

	public get serviceId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get roomId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.roomId!;
	}

	public get callId() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.callId!;
	}

	public get started() {
		return Number(this._model.started);
	}

	public get ended() {
		return this._ended;
	}

	public get clients(): ReadonlyMap<string, ObservedClient> {
		return this._clients;
	}

	public get closed() {
		return this._closed;
	}

	public close(timestamp?: number) {
		if (this._closed) return;
		this._closed = true;
		this._ended = timestamp ?? Date.now();

		this._execute(() => this._storageProvider.callStorage.remove(this.callId))
			.finally(() => this.emit('close'));
	}

	public async joinClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(
		clientId: string, 
		config: PartialBy<ObservedClientConfig<ClientAppData>, 'mediaUnitId'>,
	): Promise<ObservedClient> {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);
		let creating = this._creatingClients.get(clientId);

		if (creating) return creating;
		
		creating = this._createObservedClient<ClientAppData>(clientId, {
			...config,
			mediaUnitId: config.mediaUnitId ?? this._defaultMediaUnitId,
		}).finally(() => this._creatingClients.delete(clientId));

		this._creatingClients.set(clientId, creating);
		
		return creating;
	}

	public async save() {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);
		
		return this._execute(async () => {
			if (this._closed) throw new Error(`Call ${this.callId} is closed`);
			await this._storageProvider.callStorage.set(this.callId, this._model);
		});		
	}

	private async _createObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(clientId: string, config: ObservedClientConfig<ClientAppData>): Promise<ObservedClient> {
		const client = await ObservedClient.create<ClientAppData>(config, this, this._storageProvider);
		const onUpdate = () => this.emit('update');

		await this.save();

		client.once('close', () => {
			client.off('update', onUpdate);

			this._clients.delete(clientId);
			this._model.clientIds = this._model.clientIds.filter((id) => id !== clientId);
			this.save().catch(() => void 0);
		});
		
		client.on('update', onUpdate);
		this._clients.set(clientId, client);
		this._model.clientIds.push(clientId);
		
		return client;
	}
}