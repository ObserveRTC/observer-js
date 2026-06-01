import { EventEmitter } from 'events';
import { createLogger } from './common/logger';
import { ObservedClient, ObservedClientSettings } from './ObservedClient';
import { Observer } from './Observer';
import { ScoreCalculator } from './scores/ScoreCalculator';
import { CalculatedScore } from './scores/CalculatedScore';
import { DefaultCallScoreCalculator } from './scores/DefaultCallScoreCalculator';
import { RemoteTrackResolver } from './utils/RemoteTrackResolver';
import { OnAllClientCallUpdater } from './updaters/OnAllClientCallUpdater';
import { Updater } from './updaters/Updater';
import { OnIntervalUpdater } from './updaters/OnIntervalUpdater';
import { OnAnyClientCallUpdater } from './updaters/OnAnyClientCallUpdater';
import { Detectors } from './detectors/Detectors';
import { ClientIssue } from './schema/ClientSample';
import type { AcceptContext } from './Observer';
import type { ObserverEvents, ObservedCallScope } from './ObserverEvents';

const logger = createLogger('ObservedCall');

// `update-on-interval` requires an interval; the other policies do not use one.
type ObservedCallUpdateConfig =
	| {
		updatePolicy: 'update-on-interval',
		updateIntervalInMs: number,
	}
	| {
		updatePolicy?: 'update-on-any-client-updated' | 'update-when-all-client-updated',
		updateIntervalInMs?: number,
	};

export type ObservedCallSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = ObservedCallUpdateConfig & {
	callId: string;
	appData?: AppData;
	remoteTrackResolvePolicy?: 'p2p' | 'mediasoup-sfu' | 'none',
	closeCallIfEmptyForMs?: number,
};

export type ObservedCallEvents = {
	update: [],
	newclient: [ObservedClient],
	empty: [],
	'not-empty': [],
	close: [],
}

export declare interface ObservedCall {
	on<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	off<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	once<U extends keyof ObservedCallEvents>(event: U, listener: (...args: ObservedCallEvents[U]) => void): this;
	emit<U extends keyof ObservedCallEvents>(event: U, ...args: ObservedCallEvents[U]): boolean;
}

export class ObservedCall<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public updater?: Updater;
	public scoreCalculator: ScoreCalculator;
	public readonly detectors: Detectors;
	public readonly callId: string;
	public readonly observedClients = new Map<string, ObservedClient>();
	public readonly clientsUsedTurn = new Set<string>();
	public readonly calculatedScore: CalculatedScore = {
		weight: 1,
		value: undefined,
	};
	public remoteTrackResolver?: RemoteTrackResolver;
	
	public totalAddedClients = 0;
	public totalRemovedClients = 0;

	public numberOfIssues = 0;
	public numberOfPeerConnections = 0;
	public numberOfInboundRtpStreams = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfDataChannels = 0;

	public maxNumberOfClients = 0;
	public deltaNumberOfIssues = 0;

	// public deltaRttLt50Measurements = 0;
	// public deltaRttLt150Measurements = 0;
	// public deltaRttLt300Measurements = 0;
	// public deltaRttGtOrEq300Measurements = 0;

	public appData: AppData;
	public closed = false;
	public startedAt?: number;
	public endedAt?: number;
	public closedAt?: number;

	public readonly settings: Pick<ObservedCallSettings, 'closeCallIfEmptyForMs'>;

	/** Ancestry base shared by all Observer-bus events originating at this call. */
	public readonly eventScope: ObservedCallScope;
	private closeTimer?: ReturnType<typeof setTimeout>;

	public constructor(
		settings: ObservedCallSettings<AppData>,
		public readonly observer: Observer,
	) {
		super();
		this.setMaxListeners(Infinity);

		this.eventScope = { observer: this.observer, observedCall: this };
		this.callId = settings.callId;
		this.appData = (settings.appData ?? observer.config.createCallAppData?.({ callId: settings.callId, observer }) ?? {}) as AppData;
		this.scoreCalculator = new DefaultCallScoreCalculator(this);
		// No built-in detectors ship yet. The registry is a server-side extension point:
		// add custom call-level Detectors via `call.detectors.add(...)` and surface findings
		// with `call.addIssue(...)` (emitted on the Observer bus as `call-issue`).
		this.detectors = new Detectors();

		if (settings.updateIntervalInMs && settings.updatePolicy !== 'update-on-interval') {
			logger.warn('updateIntervalInMs is ignored unless updatePolicy is "update-on-interval" (callId: %s)', settings.callId);
		}
		switch (settings.updatePolicy) {
			case 'update-on-any-client-updated':
				this.updater = new OnAnyClientCallUpdater(this);
				break;
			case 'update-when-all-client-updated':
				this.updater = new OnAllClientCallUpdater(this);
				break;
			case 'update-on-interval':
				if (!settings.updateIntervalInMs) {
					logger.warn('updateIntervalInMs must be set when updatePolicy is "update-on-interval"; falling back to "update-when-all-client-updated" (callId: %s)', settings.callId);
					this.updater = new OnAllClientCallUpdater(this);
				} else {
					this.updater = new OnIntervalUpdater(
						settings.updateIntervalInMs,
						this.update.bind(this),
					);
				}
				break;
		}

		this.settings = {
			closeCallIfEmptyForMs: settings.closeCallIfEmptyForMs,
		};
	}

	public get numberOfClients() {
		return this.observedClients.size;
	}

	public get score() {
		return this.calculatedScore.value;
	}

	/** Raise a call-level (server-side) issue; surfaced on the Observer bus as `call-issue`. */
	public addIssue(issue: ClientIssue) {
		if (this.closed) return;

		this._notify('call-issue', { ...this.eventScope, issue });
	}

	public close() {
		if (this.closed) return;
		this.update(); // last update before closing
		this.closed = true;

		this.updater?.close();

		let minSampleTimestamps: number | undefined;
		let maxSampleTimestamps: number | undefined;

		for (const client of this.observedClients.values()) {
			client.close();

			if (client.joinedAt) minSampleTimestamps = Math.min(minSampleTimestamps ?? client.joinedAt, client.joinedAt);
			if (client.leftAt) maxSampleTimestamps = Math.max(maxSampleTimestamps ?? client.leftAt, client.leftAt);
		}

		if (this.startedAt === undefined) this.startedAt = minSampleTimestamps;
		if (this.endedAt === undefined) this.endedAt = maxSampleTimestamps;

		this.closedAt = Date.now();
		this.emit('close');
		this._notify('call-closed', { ...this.eventScope });
	}

	public getObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(clientId: string): ObservedClient<ClientAppData> | undefined {
		if (this.closed || !this.observedClients.has(clientId)) return;
		
		return this.observedClients.get(clientId) as ObservedClient<ClientAppData>;
	}

	public createObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(settings: ObservedClientSettings<ClientAppData>): ObservedClient<ClientAppData> | undefined {
		if (this.closed) {
			logger.warn('Attempted to create a client (clientId: %s) on a closed call %s', settings.clientId, this.callId);

			return undefined;
		}
		if (this.observedClients.has(settings.clientId)) {
			logger.warn('Client with id %s already exists in call %s; returning the existing instance', settings.clientId, this.callId);

			return this.observedClients.get(settings.clientId) as ObservedClient<ClientAppData>;
		}

		if (!settings.closeClientIfIdleForMs) {
			settings.closeClientIfIdleForMs = this.observer.config.closeClientIfIdleForMs;
		}

		const result = new ObservedClient<ClientAppData>(settings, this);
		const wasEmpty = this.observedClients.size === 0;
		const onUpdate = () => this._onClientUpdate(result);
		const joined = () => this._clientJoined(result);
		const left = () => this._clientLeft(result);

		result.once('close', () => {
			result.off('update', onUpdate);
			result.off('joined', joined);
			result.off('left', left);
			this.observedClients.delete(settings.clientId);

			if (this.observedClients.size === 0) {
				this.emit('empty');
				this._notify('call-empty', { ...this.eventScope });

				if (this.settings.closeCallIfEmptyForMs) {
					this.closeTimer = setTimeout(() => {
						this.close();
					}, this.settings.closeCallIfEmptyForMs);
				}
			}
			++this.totalRemovedClients;
		});
		result.on('update', onUpdate);
		result.on('joined', joined);
		result.on('left', left);
		++this.totalAddedClients;

		this.observedClients.set(settings.clientId, result);
		this.maxNumberOfClients = Math.max(this.maxNumberOfClients, this.observedClients.size);

		if (this.closeTimer) {
			clearTimeout(this.closeTimer);
			this.closeTimer = undefined;
		}

		this.emit('newclient', result);
		this._notify('client-added', { ...this.eventScope, observedClient: result });

		if (wasEmpty) {
			this.emit('not-empty');
			this._notify('call-not-empty', { ...this.eventScope });
		}

		return result;
	}

	public getOrCreateObservedClient<ClientAppData extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedClientSettings<ClientAppData>
	): ObservedClient<ClientAppData> | undefined {
		return this.getObservedClient<ClientAppData>(settings.clientId) ?? this.createObservedClient<ClientAppData>(settings);
	}

	public update(context?: AcceptContext) {
		if (this.closed) return;

		this.numberOfInboundRtpStreams = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfPeerConnections = 0;
		this.numberOfDataChannels = 0;

		for (const client of this.observedClients.values()) {
			this.numberOfInboundRtpStreams += client.numberOfInboundRtpStreams;
			this.numberOfOutboundRtpStreams += client.numberOfOutboundRtpStreams;
			this.numberOfPeerConnections += client.numberOfPeerConnections;
			this.numberOfDataChannels += client.numberOfDataChannels;
		}

		this.scoreCalculator.update();
		this.detectors.update();

		this.emit('update');
		this._notify('call-updated', { ...this.eventScope, context });

		this.deltaNumberOfIssues = 0;
	}

	private _onClientUpdate(client: ObservedClient) {
		this.deltaNumberOfIssues += client.deltaNumberOfIssues;
		this.numberOfIssues += client.deltaNumberOfIssues;
		
		if (client.usingTURN) {
			this.clientsUsedTurn.add(client.clientId);
		}
	}

	private _clientJoined(client: ObservedClient) {
		if (!client.joinedAt) return;

		this.startedAt = Math.min(this.startedAt ?? client.joinedAt, client.joinedAt);
	}

	private _clientLeft(client: ObservedClient) {
		if (!client.leftAt) return;

		this.endedAt = Math.max(this.endedAt ?? client.leftAt, client.leftAt);
	}

	/** Emit an Observer-bus event scoped to this call. */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.observer.emit(type, ...args);
	}
}