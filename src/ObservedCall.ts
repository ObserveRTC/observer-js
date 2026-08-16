import { EventEmitter } from 'events';
import { createLogger } from './common/logger';
import { ObservedClient, ObservedClientEvents, ObservedClientSettings } from './ObservedClient';
import { Observer } from './Observer';
import { ScoreCalculator } from './scores/ScoreCalculator';
import { CalculatedScore } from './scores/CalculatedScore';
import { DefaultCallScoreCalculator } from './scores/DefaultCallScoreCalculator';
import { RemoteTrackResolver } from './resolvers/RemoteTrackResolver';
import type { ObservedOutboundTrack } from './ObservedOutboundTrack';
import { AvailableCallScopeDetectorsConfigs, Detectors } from './detectors/Detectors';
import type { ObserverIssue } from './common/ObserverIssue';
import type { AcceptContext } from './Observer';
import type { ObserverEvents, ObservedCallScope } from './ObserverEvents';
import { ActiveIssuesRegistry } from './issues/ActiveIssuesRegistry';
import { ObservedClientIssueRegistry } from './issues/ObservedClientIssueRegistry';
import { Detector } from './detectors/Detector';
import { UnconsumedTrackDetector } from './detectors/UnconsumedTrackDetector';
import { TrackDeliveryMismatchDetector } from './detectors/TrackDeliveryMismatchDetector';
import { CallConcurrentIssueDetector } from './detectors/CallConcurrentIssueDetector';
import { IssueFanOutDetector } from './detectors/IssueFanOutDetector';
import { PublisherFaultCorroborationDetector } from './detectors/PublisherFaultCorroborationDetector';

const logger = createLogger('ObservedCall');

export type ObservedCallSettings<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	callId: string;
	appData?: AppData;
	closeCallIfEmptyForMs?: number,

	/**
	 * When `true`, the call's `update()` is invoked whenever a client accepts a sample. When `false`, it is not.
	 *
	 * DEFAULT: `true` — the call is updated on every client sample, which is the most common use case.
	 */
	autoUpdateOnClientUpdate?: boolean;
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

	/**
	 * Published tracks that currently have **no** subscriber linked to them.
	 *
	 * Maintained by the `RemoteTrackResolver` at the exact moments a track gains or loses its last
	 * subscriber — the only moments the answer can change. `UnconsumedTrackDetector` reads this
	 * instead of walking every published track in the call, so in a healthy call (where the set is
	 * empty) it does no work at all.
	 *
	 * Empty when no resolver is configured: without links, "no subscribers" is unknowable.
	 */
	public readonly unconsumedOutboundTracks = new Set<ObservedOutboundTrack>();

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

	public readonly settings: Pick<ObservedCallSettings, 'closeCallIfEmptyForMs' | 'autoUpdateOnClientUpdate'>;

	/** Ancestry base shared by all Observer-bus events originating at this call. */
	public readonly eventScope: ObservedCallScope;
	private closeTimer?: ReturnType<typeof setTimeout>;

	public constructor(
		settings: ObservedCallSettings<AppData>,
		public readonly observer: Observer,
		public readonly activeIssuesRegistry: ActiveIssuesRegistry,
	) {
		super();
		this.setMaxListeners(Infinity);

		this.eventScope = { observer: this.observer, observedCall: this };
		this.callId = settings.callId;
		this.appData = (settings.appData ?? {}) as AppData;
		this.scoreCalculator = new DefaultCallScoreCalculator(this);
		this.detectors = new Detectors();

		this.settings = {
			closeCallIfEmptyForMs: settings.closeCallIfEmptyForMs,
			autoUpdateOnClientUpdate: settings.autoUpdateOnClientUpdate ?? true,
		};
	}

	public get numberOfClients() {
		return this.observedClients.size;
	}

	public get score() {
		return this.calculatedScore.value;
	}

	/**
	 * Build a call-scoped detector onto this call. Chainable.
	 *
	 * To get a handle on what was built — to inspect it, or to remove that exact instance later — read
	 * it back off the registry: `call.detectors.getAll(name)`, or `call.detectors.instances`.
	 */
	public addDetector<K extends keyof AvailableCallScopeDetectorsConfigs>(name: K, config: Partial<AvailableCallScopeDetectorsConfigs[K]> = {}): this {
		if (this.closed) return this;

		let detector: Detector | undefined;

		switch (name) {
			case UnconsumedTrackDetector.NAME: {
				detector = new UnconsumedTrackDetector(this, config);
				break;
			}
			case TrackDeliveryMismatchDetector.NAME: {
				detector = new TrackDeliveryMismatchDetector(this, config);
				break;
			}
			case CallConcurrentIssueDetector.NAME: {
				detector = new CallConcurrentIssueDetector(this, config);
				break;
			}
			case IssueFanOutDetector.NAME: {
				detector = new IssueFanOutDetector(this, config);
				break;
			}
			case PublisherFaultCorroborationDetector.NAME: {
				detector = new PublisherFaultCorroborationDetector(this, config);
				break;
			}
			default: {
				logger.warn('Unknown detector name %s; skipping', name);

				return this;
			}
		}

		this.detectors.add(detector);

		return this;
	}

	/**
	 * Remove a detector from **this call** by name, returning how many were removed.
	 *
	 * **Every** instance under the name goes — a name can legitimately be registered more than once.
	 * When you want one of them specifically, go through the registry, which deals in instances:
	 *
	 * ```ts
	 * const [ first ] = call.detectors.getAll('issue-fan-out-detector');
	 *
	 * call.detectors.remove(first);
	 * ```
	 *
	 * Either route `close()`s the detector, so it unsubscribes from `activeIssuesRegistry` — without
	 * that the registry keeps feeding a detector nobody is running any more, and its tracked set grows
	 * for the life of the call.
	 *
	 * To stop building it on *future* calls too, use `observer.removeCallDetector(name)`.
	 */
	public removeDetector(name: keyof AvailableCallScopeDetectorsConfigs): number {
		return this.detectors.removeByName(name);
	}

	/**
	 * Raise a call-level (server-side) finding; surfaced on the Observer bus as `call-issue`.
	 *
	 * `payload` takes an **object** — it is delivered to in-process handlers, so there is nothing to
	 * serialise for. Pass a string only if you already have one.
	 */
	public addIssue(issue: ObserverIssue) {
		if (this.closed) return;

		this._notify('call-issue', { ...this.eventScope, issue });
	}

	public close() {
		if (this.closed) return;
		this.update(); // last update before closing
		this.closed = true;

		let minSampleTimestamps: number | undefined;
		let maxSampleTimestamps: number | undefined;
		const clients = [ ...this.observedClients.values() ];

		for (const client of clients) {
			client.close();

			if (client.joinedAt) minSampleTimestamps = Math.min(minSampleTimestamps ?? client.joinedAt, client.joinedAt);
			if (client.leftAt) maxSampleTimestamps = Math.max(maxSampleTimestamps ?? client.leftAt, client.leftAt);
		}

		if (this.startedAt === undefined) this.startedAt = minSampleTimestamps;
		if (this.endedAt === undefined) this.endedAt = maxSampleTimestamps;

		this.closedAt = Date.now();

		this.detectors.clear();
		this.activeIssuesRegistry.clear();
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
		if (settings.appData === undefined) {
			settings.appData = this.observer.config.createClientAppData?.({ clientId: settings.clientId, observedCall: this }) as ClientAppData;
		}
		const observedClientIssueRegistry = new ObservedClientIssueRegistry(this.activeIssuesRegistry);
		const result = new ObservedClient<ClientAppData>(
			settings,
			this,
			observedClientIssueRegistry,
		);
		const wasEmpty = this.observedClients.size === 0;
		const onUpdate = (...args: ObservedClientEvents['update']) => this._onClientUpdate(result, args[2]);
		const joined = () => this._clientJoined(result);
		const left = () => this._clientLeft(result);

		result.once('close', () => {
			result.off('update', onUpdate);
			result.off('joined', joined);
			result.off('left', left);
			this.observedClients.delete(settings.clientId);
			this.clientsUsedTurn.delete(settings.clientId);

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

		if (result.sink) {
			this._notify('client-sink-created', { ...this.eventScope, observedClient: result, sink: result.sink });
		}

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

	private _onClientUpdate(client: ObservedClient, context?: AcceptContext) {
		this.deltaNumberOfIssues += client.deltaNumberOfIssues;
		this.numberOfIssues += client.deltaNumberOfIssues;

		if (client.usingTURN) this.clientsUsedTurn.add(client.clientId);
		else this.clientsUsedTurn.delete(client.clientId);

		if (this.settings.autoUpdateOnClientUpdate) {
			this.update(context);
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