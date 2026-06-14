import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientSample } from './schema/ClientSample';
import { ObservedTURN } from './ObservedTURN';
import { Updater } from './updaters/Updater';
import { OnAllCallObserverUpdater } from './updaters/OnAllCallObserverUpdater';
import { OnAnyCallObserverUpdater } from './updaters/OnAnyCallObserverUpdater';
import type { RemoteTrackResolverFactory } from './utils/RemoteTrackResolver';
import type { ObserverEvents, ObserverEventBase, ObservedMediasoupRouterScope } from './ObserverEvents';
import type { ClientSampleSinkFactory } from './sinks/ClientSampleSink';
import { Middleware, MiddlewareProcessor } from './common/Middleware';
import { ObservedMediasoupRouter, ObservedMediasoupRouterSettings } from './ObservedMediasoupRouter';
import { ObservedPeerConnection } from './ObservedPeerConnection';

const logger = createLogger('Observer');

export type SampleRejectedReason = 'observer-closed' | 'missing-callId' | 'missing-clientId';

export type { ObserverEvents } from './ObserverEvents';

/**
 * Optional, free-form context supplied to `accept()`. A single context object is
 * threaded down the accept chain (Observer -> Client -> PeerConnection) and is
 * merged into the `appData` of entities created during the accept pass.
 */
export type AcceptContext = Record<string, unknown>;

/** The payload threaded through `accept()` middlewares: the sample and its optional context. */
export type AcceptMiddlewarePayload = {
	sample: ClientSample,
	context?: AcceptContext,
};

/**
 * A global middleware run on every sample passed to `observer.accept()`, in registration order,
 * **before** the sample is dispatched to any call/client. It may inspect or mutate the sample
 * (e.g. set/normalize `callId`/`clientId`, enrich, redact) or the context, then call
 * `next(payload)` to continue the chain. Not calling `next` **drops** the sample.
 */
export type AcceptMiddleware = Middleware<AcceptMiddlewarePayload>;

// Updates are event-driven: triggered when any/all calls have updated. `'none'` disables the
// automatic trigger entirely — the application must call `observer.update()` itself.
// (Apps wanting a fixed cadence can call `observer.update()` on their own timer.)
type ObserverUpdateConfig = {
	updatePolicy?: 'update-on-any-call-updated' | 'update-when-all-call-updated' | 'none',
};

/** Produces the initial `appData` for a call created without an explicit `appData`. */
export type CallAppDataFactory = (params: { callId: string, observer: Observer }) => Record<string, unknown>;

/** Produces the initial `appData` for a client created without an explicit `appData`. */
export type ClientAppDataFactory = (params: { clientId: string, observedCall: ObservedCall }) => Record<string, unknown>;

export type ObserverConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = ObserverUpdateConfig & {
	defaultCallUpdatePolicy?: ObservedCallSettings['updatePolicy'],
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

	/**
	 * Optional factory invoked when a client is created, producing a per-client sink that
	 * receives every sample the client accepts (or `undefined` for no sink). The destination
	 * can be derived from `callId` / `clientId`.
	 */
	createClientSink?: ClientSampleSinkFactory,

	/**
	 * Optional factory invoked when a call is created, producing the call's `RemoteTrackResolver`
	 * (or `undefined` for none). Use the built-ins
	 * (`createDefaultMediasoupRemoteTrackResolverFactory()` / `createP2pRemoteTrackResolverFactory()`)
	 * or build a `RemoteTrackResolver` with custom publisher/subscriber id resolvers.
	 */
	createTrackResolver?: RemoteTrackResolverFactory,
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
	public readonly observedMediasoupRouters = new Map<string, ObservedMediasoupRouter>();

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

	/** Global, pre-dispatch middleware chain run on every accepted sample. */
	public readonly acceptMiddlewares = new MiddlewareProcessor<AcceptMiddlewarePayload>();

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
			case 'none':
				// No automatic updater: `observer.update()` only runs when the app calls it.
				break;
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
			closeCallIfEmptyForMs: settings.closeCallIfEmptyForMs ?? this.config.closeCallIfEmptyForMs,
			appData: settings.appData ?? this.config.createCallAppData?.({ callId: settings.callId, observer: this }),
		} as ObservedCallSettings<T>;

		const observedCall = new ObservedCall(callSettings, this);

		// Build the call's track resolver from the configured factory (if any).
		observedCall.remoteTrackResolver = this.config.createTrackResolver?.(observedCall);

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

	public createObservedMediasoupRouter<T extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedMediasoupRouterSettings<T> & {
			callId?: string,
			bindCallByWebRtcTransportId?: boolean;
		},
	) {
		if (this.closed) {
			logger.warn('Attempted to create mediasoup router (id: %d) on a closed observer', settings.router.id);

			return undefined;
		}
		if (this.observedMediasoupRouters.has(settings.router.id)) {
			logger.warn('Observed Mediasoup Router (id %s) already exists; returning the existing instance', settings.router.id);

			return this.observedMediasoupRouters.get(settings.router.id);
		}

		const observedMediasoupRouter = new ObservedMediasoupRouter(settings);
		const observedMediasoupRouterScope: ObservedMediasoupRouterScope = {
			observedMediasoupRouter,
			observer: this,
		};
		// The observer does NOT store the router (or its sample) on the call. Instead, when the router is
		// matched to a call it emits `mediasoup-router-matched-with-call` and the application decides what to
		// do with the pairing (e.g. stamp the callId into the router's appData/attachments, index it, etc.).
		const directCall = settings.callId ? this.observedCalls.get(settings.callId) : undefined;

		if (directCall) {
			// Explicit match: the caller already knows the call this router belongs to.
			this.emit('mediasoup-router-matched-with-call', {
				...observedMediasoupRouterScope,
				observedCall: directCall,
			});
		} else if (settings.bindCallByWebRtcTransportId) {
			// Implicit match: correlate the router's WebRTC transport ids with observed peer-connection ids.
			// Emit once per distinct matched call, and keep listening so further calls can still match.
			const matchedCallIds = new Set<string>();
			const onPeerConnectionAdded = ({ observedPeerConnection, observedCall }: ObserverEvents['peer-connection-added'][0]) => {
				if (!observedMediasoupRouter.webrtcTransportIds.has(observedPeerConnection.peerConnectionId)) return;
				if (matchedCallIds.has(observedCall.callId)) return;

				matchedCallIds.add(observedCall.callId);
				this.emit('mediasoup-router-matched-with-call', {
					...observedMediasoupRouterScope,
					observedCall,
				});
			};
			const stopMatching = () => this.off('peer-connection-added', onPeerConnectionAdded);

			this.on('peer-connection-added', onPeerConnectionAdded);
			this.once('observer-closed', stopMatching);
			observedMediasoupRouter.once('close', stopMatching);
		}

		observedMediasoupRouter.once('close', () => {
			this.observedMediasoupRouters.delete(observedMediasoupRouter.id);

			this.emit('mediasoup-router-removed', observedMediasoupRouterScope);
		});
		this.observedMediasoupRouters.set(observedMediasoupRouter.id, observedMediasoupRouter);

		this.emit('mediasoup-router-added', observedMediasoupRouterScope);

		return observedMediasoupRouter;
	}

	public close() {
		if (this.closed) {
			return logger.debug('Attempted to close twice');
		}
		this.closed = true;

		this.observedCalls.forEach((call) => call.close());

		this._notify('observer-closed', { ...this.eventScope });
	}

	public accept(sample: ClientSample, context?: AcceptContext): void {
		if (this.closed) {
			return this._notify('sample-rejected', { ...this.eventScope, reason: 'observer-closed', sample });
		}

		try {
			this.acceptMiddlewares.process({ sample, context });
		} catch (err) {
			logger.warn('An accept middleware threw; dropping the sample. %o', err);
		}

		if (!sample.callId) {
			this._notify('sample-rejected', { ...this.eventScope, reason: 'missing-callId', sample });

			return;
		}
		if (!sample.clientId) {
			this._notify('sample-rejected', { ...this.eventScope, reason: 'missing-clientId', sample });

			return;
		}

		let call = this.getObservedCall(sample.callId);

		if (!call) {
			call = this.createObservedCall({
				callId: sample.callId,
				appData: this.config.createCallAppData?.({ callId: sample.callId, observer: this }),
			});
		}
		if (!call) return;

		let client = call.getObservedClient(sample.clientId);

		if (!client) {
			client = call.createObservedClient({
				clientId: sample.clientId,
				appData: this.config.createClientAppData?.({ clientId: sample.clientId, observedCall: call }),
			});
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
