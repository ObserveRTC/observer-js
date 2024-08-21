import { EventEmitter } from 'events';
import { ObservedClient, ObservedClientModel } from './ObservedClient';
import { Observer } from './Observer';
import { createClientJoinedEventReport, createClientLeftEventReport } from './common/callEventReports';
import { getMedian, PartialBy } from './common/utils';
import { CallEventReport } from '@observertc/report-schemas-js';
import { createProcessor } from './common/Middleware';
import { ClientSample } from '@observertc/sample-schemas-js';
import { ObservedOutboundAudioTrack } from './ObservedOutboundAudioTrack';
import { ObservedOutboundVideoTrack } from './ObservedOutboundVideoTrack';
import { CalculatedScore } from './common/CalculatedScore';

export type ObservedCallModel = {
	serviceId: string;
	roomId: string;
	callId: string;
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
	callevent: [Omit<CallEventReport, 'callId' | 'serviceId' | 'roomId'>],
	empty: [],
	close: [],
}

export declare interface ObservedCall {
	on<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	off<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	once<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	emit<U extends keyof ObservedCallEvents>(event: U, ...args: ObservedCallEvents[U]): boolean;
}

export class ObservedCall<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly created = Date.now();

	public readonly processor = createProcessor<ClientSample>();

	private readonly _clients = new Map<string, ObservedClient>();
	
	public _scoreData?: {
		score: CalculatedScore,
		calculated: number,
	};

	public readonly sfuStreamIdToOutboundAudioTrack = new Map<string | number, ObservedOutboundAudioTrack>();
	public readonly sfuStreamIdToOutboundVideoTrack = new Map<string | number, ObservedOutboundVideoTrack>();
	private _closed = false;
	private _updated = Date.now();
	public ended?: number;
	public started?: number = Date.now();

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

	public get updated() {
		return this._updated;
	}

	public get clients(): ReadonlyMap<string, ObservedClient> {
		return this._clients;
	}

	public get score(): CalculatedScore | undefined {
		const now = Date.now();

		if (now - 15000 < (this._scoreData?.calculated ?? 0)) {
			return this._scoreData?.score;
		} else if (this.clients.size < 1) {
			return {
				remarks: [ {
					severity: 'none',
					text: 'No clients',
				} ],
				score: 5.0,
				timestamp: now,
			};
		}
		const scores = [ ...this.clients.values() ].map((client) => client.score?.score ?? 5.0);

		this._scoreData = {
			score: {
				remarks: [],
				score: getMedian(scores),
				timestamp: now,
			},
			calculated: now,
		};

		return this._scoreData.score;
	}

	public get closed() {
		return this._closed;
	}

	public close(timestamp?: number) {
		if (this._closed) return;
		this._closed = true;

		if (timestamp) {
			this.ended = timestamp;
		} else if (!this.ended) {
			this.ended = Date.now();
		}

		Array.from(this._clients.values()).forEach((client) => client.close());
		
		this.emit('close');
	}

	public addEventReport(params: PartialBy<Omit<CallEventReport, 'serviceId' | 'roomId' | 'callId' >, 'timestamp'>) {
		this.reports.addCallEventReport({
			...params,
			serviceId: this.serviceId,
			roomId: this.roomId,
			callId: this.callId,
			timestamp: params.timestamp ?? Date.now(),
		});
	}

	public createClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(config: ObservedClientModel & { 
		appData: ClientAppData, 
		// in case we generate the CLIENT_JOINED report we can set the timestamp of the event
		// in that case we should set the client.left to the timestamp of the leaving.
		// by default the timestamp is set to the current time
		joinedTimestamp?: number,
		createClientJoinedReport?: boolean, 
		createClientLeftReport?: boolean,
	}) {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);

		const { 
			appData, 
			createClientJoinedReport, 
			createClientLeftReport,
			joinedTimestamp = Date.now(), 
			...model 
		} = config;
		
		const result = new ObservedClient(model, this, appData);
		const onUpdate = ({ sample }: { sample: ClientSample }) => {
			this._updated = Date.now();
			this.emit('update');

			this.processor.process(sample);
		};

		result.once('close', () => {
			result.off('update', onUpdate);
			this._clients.delete(result.clientId);
			
			if (this._clients.size === 0) {
				this.emit('empty');
			}
		});

		result.on('update', onUpdate);
		this._clients.set(result.clientId, result);

		if (createClientJoinedReport) {
			this.reports.addCallEventReport(createClientJoinedEventReport(
				this.serviceId,
				result.mediaUnitId,
				this.roomId,
				this.callId,
				result.clientId,
				result.joined ?? joinedTimestamp,
				result.userId,
				result.marker,
			));
		}

		result.once('close', () => {
			if (createClientLeftReport) {
				this.reports.addCallEventReport(createClientLeftEventReport(
					this.serviceId,
					result.mediaUnitId,
					this.roomId,
					this.callId,
					result.clientId,
					result.left ?? Date.now(),
					result.userId,
					result.marker,
				));
			}
		});

		this.emit('newclient', result);
		
		return result;
	}
}