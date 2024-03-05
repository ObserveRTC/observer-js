import { EventEmitter } from 'events';
import * as Models from './models/Models';
import { ObservedClient, ObservedClientConfig } from './ObservedClient';
import { createSingleExecutor } from './common/SingleExecutor';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { Observer } from './Observer';
import { createClientJoinedEventReport, createClientLeftEventReport } from './common/callEventReports';

export type ObservedCallConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	serviceId: string;
	roomId: string;
	callId: string;
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
		observer: Observer,
		// storageProvider: StorageProvider,
		// reportsCollector: ReportsCollector,
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
			observer,
			// storageProvider, 
			// reportsCollector, 
			config.appData,
		);

		const alreadyInserted = await observer.storage.callStorage.insert(config.callId, model);

		if (alreadyInserted) throw new Error(`Call with id ${config.callId} already exists`);

		return result;
	}

	private readonly _execute = createSingleExecutor();
	private readonly _creatingClients = new Map<string, Promise<ObservedClient>>();
	private readonly _clients = new Map<string, ObservedClient>();
	
	public readonly sfuStreamIdToOutboundAudioTrack = new Map<string | number, ObservedOutboundTrack<'audio'>>();
	public readonly sfuStreamIdToOutboundVideoTrack = new Map<string | number, ObservedOutboundTrack<'video'>>();
	private _closed = false;
	private _ended?: number;

	private constructor(
		private readonly _model: Models.Call,
		public readonly observer: Observer,
		public readonly appData: AppData,
	) {
		super();
	}

	public get serviceId(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this._model.serviceId!;
	}

	public get reports() {
		return this.observer.reports;
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

		Array.from(this._clients.values()).forEach((client) => client.close());

		this._execute(() => this.observer.storage.callStorage.remove(this.callId))
			.catch(() => void 0)
			.finally(() => this.emit('close'));
	}

	public async createClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(
		clientId: string, 
		config: { mediaUnitId?: string, appData: ClientAppData, joined?: number }
	): Promise<ObservedClient<ClientAppData>> {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);
		let creating = this._creatingClients.get(clientId);

		if (creating) return creating as Promise<ObservedClient<ClientAppData>>;
		
		creating = this._createObservedClient<ClientAppData>(clientId, {
			callId: this.callId,
			appData: config.appData,
			clientId,
			overflowingProcessingThreshold: 2,
			mediaUnitId: config.mediaUnitId ?? this.observer.config.defaultMediaUnitId,
			joined: config.joined,
		}).finally(() => this._creatingClients.delete(clientId));

		this._creatingClients.set(clientId, creating);
		
		return creating as Promise<ObservedClient<ClientAppData>>;
	}

	public async save() {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);
		
		return this._execute(async () => {
			if (this._closed) throw new Error(`Call ${this.callId} is closed`);
			await this.observer.storage.callStorage.set(this.callId, this._model);
		});		
	}

	private async _createObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(clientId: string, config: ObservedClientConfig<ClientAppData>): Promise<ObservedClient> {
		const client = await ObservedClient.create<ClientAppData>(config, this, this.observer.storage);
		const onUpdate = () => this.emit('update');

		await this.save();

		client.once('close', () => {
			client.off('update', onUpdate);

			this._clients.delete(clientId);
			this._model.clientIds = this._model.clientIds.filter((id) => id !== clientId);
			this.save().catch(() => void 0);

			if (this.observer.config.addJoinAndDetachClientEvent) {
				this.reports.addCallEventReport(createClientLeftEventReport(
					this.serviceId,
					client.mediaUnitId,
					this.roomId,
					this.callId,
					client.clientId,
					client.joined,
					client.userId,
					client.marker,
				));
			}
		});
		
		client.on('update', onUpdate);
		this._clients.set(clientId, client);
		this._model.clientIds.push(clientId);

		if (this.observer.config.addJoinAndDetachClientEvent) {
			this.reports.addCallEventReport(createClientJoinedEventReport(
				this.serviceId,
				client.mediaUnitId,
				this.roomId,
				this.callId,
				client.clientId,
				client.joined,
				client.userId,
				client.marker,
			));
		}
		
		return client;
	}
}