import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientSample } from './schema/ClientSample';
import { ObservedTURN } from './ObservedTURN';
import { Updater } from './updaters/Updater';
import { OnIntervalUpdater } from './updaters/OnIntervalUpdater';
import { OnAllCallObserverUpdater } from './updaters/OnAllCallObserverUpdater';
import { OnAnyCallObserverUpdater } from './updaters/OnAnyCallObserverUpdater';
import { MediasoupRemoteTrackResolver } from './utils/MediasoupRemoteTrackResolver';
import type { ObserverEvents, ObserverEventBase } from './ObserverEvents';

const logger = createLogger('Observer');

export type SampleRejectedReason = 'observer-closed' | 'missing-callId' | 'missing-clientId';

export type { ObserverEvents } from './ObserverEvents';

/**
 * Optional, free-form context supplied to `accept()`. A single context object is
 * threaded down the accept chain (Observer -> Client -> PeerConnection) and is
 * merged into the `appData` of entities created during the accept pass.
 */
export type AcceptContext = Record<string, unknown>;

// `update-on-interval` requires an interval; the other policies do not use one.
// This makes the illegal combination a compile-time error instead of a runtime throw.
type ObserverUpdateConfig =
	| {
		updatePolicy: 'update-on-interval',
		updateIntervalInMs: number,
	}
	| {
		updatePolicy?: 'update-on-any-call-updated' | 'update-when-all-call-updated',
		updateIntervalInMs?: number,
	};

/** Produces the initial `appData` for a call created without an explicit `appData`. */
export type CallAppDataFactory = (params: { callId: string, observer: Observer }) => Record<string, unknown>;

/** Produces the initial `appData` for a client created without an explicit `appData`. */
export type ClientAppDataFactory = (params: { clientId: string, observedCall: ObservedCall }) => Record<string, unknown>;

export type ObserverConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = ObserverUpdateConfig & {
	defaultCallUpdatePolicy?: ObservedCallSettings['updatePolicy'],
	defaultCallUpdateIntervalInMs?: number,
	appData?: AppData,
	closeClientIfIdleForMs?: number,
	closeCallIfEmptyForMs?: number,

	/**
	 * Optional factory invoked when a call is created without an explicit `appData`
	 * (e.g. lazily by `accept()`), so apps can enrich appData without pre-creating the
	 * entity. `appData` is application-owned; it is never modified by the `accept()` context.
	 */
	createCallAppData?: CallAppDataFactory,

	/** Same as `createCallAppData`, for clients. Receives the (already-created) parent call. */
	createClientAppData?: ClientAppDataFactory,
}

export declare interface Observer {
	on<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	off<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	once<U extends keyof ObserverEvents>(event: U, listener: (...args: ObserverEvents[U]) => void): this;
	emit<U extends keyof ObserverEvents>(event: U, ...args: ObserverEvents[U]): boolean;
}

export class Observer<AppData extends Record<string, unknown> = Record<string, unknown>> extends EventEmitter {
	public readonly observedTURN = new ObservedTURN();
	public readonly observedCalls = new Map<string, ObservedCall>();
	public updater?: Updater;

	/** Ancestry base shared by all Observer-bus events originating at the observer. */
	public readonly eventScope: ObserverEventBase = { observer: this };

	public closed = false;

	public totalAddedCall = 0;
	public totalRemovedCall = 0;

	public numberOfClientsUsingTurn = 0;
	public numberOfClients = 0;
	public numberOfInboundRtpStreams = 0;
	public numberOfOutboundRtpStreams = 0;
	public numberOfDataChannels = 0;
	public numberOfPeerConnections = 0;

	private _timer?: ReturnType<typeof setInterval>;

	public constructor(public readonly config: ObserverConfig<AppData> = {
		updatePolicy: 'update-when-all-call-updated',
		appData: {} as AppData,
	}) {
		super();
		this.setMaxListeners(Infinity);
		this.update = this.update.bind(this);

		const currentUpdatePolicy = (config?.updatePolicy) ?? 'update-when-all-call-updated';

		switch (currentUpdatePolicy) {
			case 'update-on-any-call-updated':
				this.updater = new OnAnyCallObserverUpdater(this);
				break;
			case 'update-when-all-call-updated':
				this.updater = new OnAllCallObserverUpdater(this);
				break;
			case 'update-on-interval': {
				const interval = config?.updateIntervalInMs;

				if (!interval) {
					logger.warn('updateIntervalInMs must be set when updatePolicy is "update-on-interval"; falling back to "update-when-all-call-updated"');
					this.updater = new OnAllCallObserverUpdater(this);
				} else {
					this.updater = new OnIntervalUpdater(
						interval,
						this.update.bind(this),
					);
				}
				break;
			}
		}
	}

	public get numberOfCalls() {
		return this.observedCalls.size;
	}

	public get appData() {
		return this.config.appData;
	}

	public getObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(callId: string): ObservedCall<T> | undefined {
		if (this.closed || !this.observedCalls.has(callId)) return;

		return this.observedCalls.get(callId) as ObservedCall<T>;
	}

	public createObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedCallSettings<T>
	): ObservedCall<T> | undefined {
		if (this.closed) {
			logger.warn('Attempted to create a call (callId: %s) on a closed observer', settings.callId);

			return undefined;
		}
		if (this.observedCalls.has(settings.callId)) {
			logger.warn('Observed Call with id %s already exists; returning the existing instance', settings.callId);

			return this.observedCalls.get(settings.callId) as ObservedCall<T>;
		}

		// Apply observer-level defaults without mutating the caller's (discriminated-union) settings object.
		const callSettings = {
			...settings,
			updatePolicy: settings.updatePolicy ?? this.config.defaultCallUpdatePolicy,
			updateIntervalInMs: settings.updateIntervalInMs ?? this.config.defaultCallUpdateIntervalInMs,
			closeCallIfEmptyForMs: settings.closeCallIfEmptyForMs ?? this.config.closeCallIfEmptyForMs,
		} as ObservedCallSettings<T>;

		const observedCall = new ObservedCall(callSettings, this);

		if (callSettings.remoteTrackResolvePolicy === 'mediasoup-sfu') {
			observedCall.remoteTrackResolver = new MediasoupRemoteTrackResolver(observedCall);
		}
		// 'p2p' is reserved for future use; 'none'/undefined => no resolver.

		observedCall.once('close', () => {
			this.observedCalls.delete(observedCall.callId);
			++this.totalRemovedCall;
		});

		this.observedCalls.set(observedCall.callId, observedCall);
		++this.totalAddedCall;

		this._notify('call-added', { ...this.eventScope, observedCall });

		return observedCall;
	}

	public getOrCreateObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedCallSettings<T>
	): ObservedCall<T> | undefined {
		return this.getObservedCall<T>(settings.callId) ?? this.createObservedCall<T>(settings);
	}

	public close() {
		if (this.closed) {
			return logger.debug('Attempted to close twice');
		}
		this.closed = true;
		clearInterval(this._timer);
		this._timer = undefined;

		this.observedCalls.forEach((call) => call.close());

		this._notify('observer-closed', { ...this.eventScope });
	}

	public accept(sample: ClientSample, context?: AcceptContext) {
		if (this.closed) {
			this._notify('sample-rejected', { ...this.eventScope, reason: 'observer-closed', sample });

			return;
		}
		if (!sample.callId) {
			this._notify('sample-rejected', { ...this.eventScope, reason: 'missing-callId', sample });

			return;
		}
		if (!sample.clientId) {
			this._notify('sample-rejected', { ...this.eventScope, reason: 'missing-clientId', sample });

			return;
		}

		// Lazily create the call/client. appData for new entities comes only from the
		// configured factory (createCallAppData / createClientAppData) applied in their
		// constructors — never from the accept `context`. The context is transient and is
		// only carried through to the `*-updated` events.
		let call = this.getObservedCall(sample.callId);

		if (!call) {
			call = this.createObservedCall({ callId: sample.callId });
		}
		if (!call) return;

		let client = call.getObservedClient(sample.clientId);

		if (!client) {
			client = call.createObservedClient({ clientId: sample.clientId });
		}
		if (!client) return;

		client.accept(sample, context);
	}

	public update() {
		if (this.closed) {
			return;
		}

		this.numberOfInboundRtpStreams = 0;
		this.numberOfOutboundRtpStreams = 0;
		this.numberOfPeerConnections = 0;
		this.numberOfDataChannels = 0;
		this.numberOfClients = 0;
		this.numberOfClientsUsingTurn = 0;

		for (const call of this.observedCalls.values()) {
			this.numberOfInboundRtpStreams += call.numberOfInboundRtpStreams;
			this.numberOfOutboundRtpStreams += call.numberOfOutboundRtpStreams;
			this.numberOfPeerConnections += call.numberOfPeerConnections;
			this.numberOfDataChannels += call.numberOfDataChannels;
			this.numberOfClients += call.numberOfClients;
			this.numberOfClientsUsingTurn += call.clientsUsedTurn.size;
		}

		this.observedTURN.update();

		this._notify('observer-updated', { ...this.eventScope });
	}

	/** Emit an Observer-bus event. */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.emit(type, ...args);
	}
}
