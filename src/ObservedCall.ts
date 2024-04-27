import { EventEmitter } from 'events';
import { ObservedClient, ObservedClientEvents, ObservedClientModel } from './ObservedClient';
import { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { Observer } from './Observer';
import { createClientJoinedEventReport } from './common/callEventReports';
import { PartialBy } from './common/utils';
import { CallEventReport } from '@observertc/report-schemas-js';
import { createProcessor } from './common/Middleware';
import { ClientSample } from '@observertc/sample-schemas-js';
import { ClientIssue } from './monitors/CallSummary';

type ClientIssueDetectionConfig = Pick<ClientIssue, 'severity'>;

export type ObservedCallModel = {
	serviceId: string;
	roomId: string;
	callId: string;
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
	callevent: [Omit<CallEventReport, 'callId' | 'serviceId' | 'roomId'>],
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
	
	public readonly sfuStreamIdToOutboundAudioTrack = new Map<string | number, ObservedOutboundTrack<'audio'>>();
	public readonly sfuStreamIdToOutboundVideoTrack = new Map<string | number, ObservedOutboundTrack<'video'>>();
	private _closed = false;
	private _updated = Date.now();
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

	public get updated() {
		return this._updated;
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
		generateClientJoinedReport?: boolean, 
		joined?: number,
		detectIssues?: {
			rejoin: ClientIssue['severity'] | ClientIssueDetectionConfig,
		},
	}) {
		if (this._closed) throw new Error(`Call ${this.callId} is closed`);

		const { 
			appData, 
			generateClientJoinedReport, 
			joined = Date.now(), 
			detectIssues = {
				rejoin: 'minor'
			}, 
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
		});

		result.on('update', onUpdate);
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

		if (detectIssues?.rejoin) {
			const issueBaseConfig = typeof detectIssues.rejoin === 'object' ? detectIssues.rejoin : { 
				severity: detectIssues.rejoin 
			};
			
			const rejoinedClientIssueListener = (event: ObservedClientEvents['rejoined'][0]) => {
				event.lastJoined;
				result.addIssue({
					timestamp: Date.now(),
					...issueBaseConfig,
				});
			};

			result.once('close', () => {
				result.off('rejoined', rejoinedClientIssueListener);
			});
			result.on('rejoined', rejoinedClientIssueListener);
		}

		this.emit('newclient', result);
		
		return result;
	}
}