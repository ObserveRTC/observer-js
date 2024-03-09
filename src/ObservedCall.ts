import { EventEmitter } from 'events';
import { ObservedClient, ObservedClientModel } from './ObservedClient';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { Observer } from './Observer';
import { createClientJoinedEventReport } from './common/callEventReports';

export type ObservedCallModel = {
	serviceId: string;
	roomId: string;
	callId: string;
	started: number,
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
	private readonly _clients = new Map<string, ObservedClient>();
	
	public readonly sfuStreamIdToOutboundAudioTrack = new Map<string | number, ObservedOutboundTrack<'audio'>>();
	public readonly sfuStreamIdToOutboundVideoTrack = new Map<string | number, ObservedOutboundTrack<'video'>>();
	private _closed = false;
	private _ended?: number;

	public constructor(
		private readonly _model: ObservedCallModel,
		public readonly observer: Observer,
		public readonly appData: AppData,
	) {
		super();
		this.setMaxListeners(Infinity);
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
		
		this.emit('close');
	}

	public createClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(config: ObservedClientModel & { appData: ClientAppData, generateClientJoinedReport?: boolean, joined?: number }) {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);

		const { appData, generateClientJoinedReport, joined = Date.now(), ...model } = config;
		
		const result = new ObservedClient(model, this, appData);

		result.once('close', () => {
			this._clients.delete(result.clientId);
		});
		this._clients.set(result.clientId, result);

		if (generateClientJoinedReport) {
			this.reports.addCallEventReport(createClientJoinedEventReport(
				this.serviceId,
				result.mediaUnitId,
				this.roomId,
				this.callId,
				result.clientId,
				joined,
				result.userId,
				result.marker,
			));
		}
		
		return result;
	}
}