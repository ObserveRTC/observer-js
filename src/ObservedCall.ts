import { EventEmitter } from 'events';
import { ObservedClient, ObservedClientSettings } from './ObservedClient';
import { Observer } from './Observer';
import { ScoreCalculator } from './scores/ScoreCalculator';
import { CalculatedScore } from './scores/CalculatedScore';
import { DefaultCallScoreCalculator } from './scores/DefaultCallScoreCalculator';
import { Detectors } from './detectors/Detectors';
import { RemoteTrackResolver } from './utils/RemoteTrackResolver';
import { CallUpdater } from './utils/CallUpdater';
import { OnAllClientCallUpdater } from './utils/OnAllClientCallUpdater';
import { OnAnyClientCallUpdater } from './utils/onAnyClientCallUpdater';

export type ObservedCallSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	appData?: AppData;
	remoteTrackResolvePolicy?: 'p2p' | 'mediasoup-sfu',
	callUpdaterPolicy?: 'onAnyClientUpdate' | 'onAllClientsUpdate',
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
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
	public readonly detectors: Detectors;
	public readonly callId: string;
	public readonly observedClients = new Map<string, ObservedClient>();
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public remoteTrackResolver?: RemoteTrackResolver;
	public callUpdater?: CallUpdater;
	
	public appData?: AppData;
	public closed = false;
	public started?: number;
	public ended?: number;
	public scoreCalculator: ScoreCalculator;

	public constructor(
		settings: ObservedCallSettings<AppData>,
		public readonly observer: Observer,
	) {
		super();
		this.setMaxListeners(Infinity);

		this.callId = settings.callId;
		this.appData = settings.appData;
		this.scoreCalculator = new DefaultCallScoreCalculator(this);
		this.detectors = new Detectors();
		
		switch (settings.callUpdaterPolicy) {
			case 'onAllClientsUpdate':
				this.callUpdater = new OnAllClientCallUpdater(this);	
				break;
			case 'onAnyClientUpdate':
				this.callUpdater = new OnAnyClientCallUpdater(this);	
				break;
		}

		switch (settings.remoteTrackResolvePolicy) {
			case 'mediasoup-sfu':
				break;
		}
	}

	public get score() { 
		return this.calculatedScore.value; 
	}

	public close() {
		if (this.closed) return;
		this.closed = true;

		[ ...this.observedClients.values() ].forEach((client) => client.close());

		this.emit('close');
	}

	public getObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(clientId: string): ObservedClient<ClientAppData> | undefined {
		if (this.closed || !this.observedClients.has(clientId)) return;
		
		return this.observedClients.get(clientId) as ObservedClient<ClientAppData>;
	}

	public createObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(settings: ObservedClientSettings<ClientAppData>): ObservedClient<ClientAppData> {
		if (this.closed) throw new Error(`Call ${this.callId} is closed`);
		if (this.observedClients.has(settings.clientId)) throw new Error(`Client with id ${settings.clientId} already exists`);

		const result = new ObservedClient<ClientAppData>(settings, this);

		const onUpdate = () => this.callUpdater?.onClientUpdate(result);

		result.once('close', () => {
			result.off('update', onUpdate);
			this.observedClients.delete(settings.clientId);

			if (this.observedClients.size === 0) {
				this.emit('empty');
			}
		});
		result.on('update', onUpdate);
		this.observedClients.set(settings.clientId, result);

		this.emit('newclient', result);

		return result;
	}

	public update() {
		this.detectors.update();
		this.scoreCalculator.update();

		this.emit('update');
	}
}