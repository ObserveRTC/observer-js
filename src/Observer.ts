import { createLogger } from './common/logger';
import { ObservedCall, ObservedCallSettings } from './ObservedCall';
import { EventEmitter } from 'events';
import { ClientSample } from './schema/ClientSample';
import { ObservedTURN } from './ObservedTURN';
import type { RemoteTrackResolverFactory } from './resolvers/RemoteTrackResolver';
import type { ObserverEvents, ObserverEventBase, ObservedMediasoupRouterScope } from './ObserverEvents';
import type { ClientSampleSinkFactory } from './sinks/ClientSampleSink';
import { Middleware, MiddlewareProcessor } from './common/Middleware';
import { ObservedMediasoupRouter, ObservedMediasoupRouterSettings } from './ObservedMediasoupRouter';
import { AvailableCallScopeDetectorsConfigs, AvailableObserverScopeDetectorsConfigs, Detectors } from './detectors/Detectors';
import type { AvailableValidatorConfigs } from './validators/Validators';
import type { ValidationReport, RunningValidator } from './validators/Validator';
import type { ObserverIssue } from './common/ObserverIssue';
import { ActiveIssuesRegistry } from './issues/ActiveIssuesRegistry';
import type { Detector } from './detectors/Detector';
import { SfuCongestionDetector } from './detectors/SfuCongestionDetector';
import { IceDisruptionDetector } from './detectors/IceDisruptionDetector';
import { ConcurrentIssueDetector } from './detectors/ConcurrentIssueDetector';
import { TurnServerHealthDetector } from './detectors/TurnServerHealthDetector';
import { TurnServerOutageDetector } from './detectors/TurnServerOutageDetector';
import { UnconsumedTrackDetector } from './detectors/UnconsumedTrackDetector';
import { TrackDeliveryMismatchDetector } from './detectors/TrackDeliveryMismatchDetector';
import { IssueFanOutDetector } from './detectors/IssueFanOutDetector';
import { SimulcastReceiverValidator } from './validators/SimulcastReceiverValidator';

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

/** Produces the initial `appData` for a call created without an explicit `appData`. */
export type CallAppDataFactory = (params: { callId: string, observer: Observer }) => Record<string, unknown>;

/** Produces the initial `appData` for a client created without an explicit `appData`. */
export type ClientAppDataFactory = (params: { clientId: string, observedCall: ObservedCall }) => Record<string, unknown>;

export type ObserverConfig<AppData extends Record<string, unknown> = Record<string, unknown>> = {
	appData?: AppData,
	closeClientIfIdleForMs?: number,
	closeCallIfEmptyForMs?: number,

	/**
	 * When `true` (the default), every call update triggers an observer-wide `update()` pass.
	 *
	 * There is deliberately no timer and no separate policy object: a call is updated when any of its
	 * clients is, and the observer is updated when any of its calls is — so the observer is updated
	 * exactly when any client anywhere is. Set to `false` only if you drive `observer.update()`
	 * yourself, and note that observer-scoped detectors and validators run *nowhere else*.
	 */
	autoUpdateOnCallUpdate?: boolean;

	inboundTrackDegradationThresholds?: {
		deltaFreezeCount: number,
		framesDroppedRatio: number,
		jitterBufferDelayInMs: number,
		concealmentRatio: number,
		rttInMs: number,
	},

	outboundTrackDegradationThresholds?: {
		fractionLost: number,
		rttInMs: number,
	},

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
	createRemoteTrackResolver?: RemoteTrackResolverFactory,

	/**
	 * Observer-scoped detectors — those reasoning **across calls** — created on construction.
	 *
	 * Each key follows {@link DetectorSlot}: omitted → created with its defaults, an object → those
	 * keys merged over the defaults, `null` → not created. Omitting the whole property creates all of
	 * them; set it to `null` to run with no observer-scoped detectors at all.
	 *
	 * ```ts
	 * new Observer({
	 *   observerDetectors: {
	 *     'turn-server-outage-detector': { minClientsAtPeak: 10 },
	 *     'concurrent-issue-detector': null,
	 *   },
	 * });
	 * ```
	 */
	observerDetectors?: {
		[K in keyof AvailableObserverScopeDetectorsConfigs]?: DetectorSlot<AvailableObserverScopeDetectorsConfigs[K]>;
	} | null

	/**
	 * Call-scoped detectors, applied to **every call** this observer creates. Same three-state
	 * semantics as `observerDetectors`.
	 */
	callDetectors?: {
		[K in keyof AvailableCallScopeDetectorsConfigs]?: DetectorSlot<AvailableCallScopeDetectorsConfigs[K]>;
	} | null

}

/**
 * Per-detector configuration slot.
 *
 * Three states, and the distinction between the last two is the point:
 *
 * - **omitted / `undefined`** — the detector is created with its own defaults.
 * - **an object** — created with those keys merged over its defaults.
 * - **`null`** — *not created at all*.
 *
 * This mirrors `client-monitor-js` deliberately: the same mental model should apply on both sides of
 * the wire. `undefined` cannot mean "off", because that would make every detector opt-in and the
 * common case (`new Observer()`) would silently detect nothing.
 *
 * Each detector owns its own defaults, in its constructor, next to the doc that explains what the
 * threshold means. Read them there.
 */
export type DetectorSlot<T> = Partial<T> | null;

/**
 * Every observer-scoped detector, in creation order.
 *
 * Listed explicitly rather than derived from a type, because the three-state slot semantics need to
 * iterate the *complete* set — including the keys the caller never mentioned, which is exactly the
 * set a `Object.entries(config)` loop cannot see. Adding a detector without adding it here means it
 * is never created by default, so the compiler is made to care: the array is typed as the full key
 * set, and a missing entry fails to type-check.
 */
export const OBSERVER_SCOPE_DETECTOR_NAMES: readonly (keyof AvailableObserverScopeDetectorsConfigs)[] = [
	SfuCongestionDetector.NAME,
	IceDisruptionDetector.NAME,
	ConcurrentIssueDetector.NAME,
	TurnServerHealthDetector.NAME,
	TurnServerOutageDetector.NAME,
];

/** Every call-scoped detector, created for each call. See {@link OBSERVER_SCOPE_DETECTOR_NAMES}. */
export const CALL_SCOPE_DETECTOR_NAMES: readonly (keyof AvailableCallScopeDetectorsConfigs)[] = [
	UnconsumedTrackDetector.NAME,
	TrackDeliveryMismatchDetector.NAME,
	ConcurrentIssueDetector.NAME,
	IssueFanOutDetector.NAME,
];

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

	/** Ancestry base shared by all Observer-bus events originating at the observer. */
	public readonly eventScope: ObserverEventBase = { observer: this };
	public readonly config: ObserverConfig<AppData>;

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

	/**
	 * Fleet-wide index of every open client issue, maintained incrementally as issues open and close.
	 * Each call's index propagates into this one, so cross-call queries cost O(matching issues) rather
	 * than a walk over every call and client. This is what observer-scoped detectors read.
	 */
	public readonly activeIssuesRegistry = new ActiveIssuesRegistry();

	/**
	 * Validators currently running. Each removes itself when it finishes, so this is normally empty —
	 * a validator is a one-shot check, not a permanent fixture. Start one with {@link addValidator}.
	 */
	public readonly validators = new Set<RunningValidator>();

	/**
	 * Observer-scoped detector registry, run on every `observer.update()` — the place for findings
	 * that span **calls**, e.g. "many calls on the same SFU degraded at once". Detectors raise
	 * findings with `observer.addIssue(...)`, surfaced on the bus as `observer-issue`.
	 * (For findings within a single call use `observedCall.detectors`.)
	 *
	 * Populated from `config.detectors` at construction; add your own with `detectors.add(...)`.
	 */
	public readonly detectors = new Detectors();

	public constructor(config: Partial<ObserverConfig<AppData>> = {}) {
		super();
		this.setMaxListeners(Infinity);
		this.update = this.update.bind(this);

		this.config = {
			autoUpdateOnCallUpdate: true,
			appData: {} as AppData,
			closeCallIfEmptyForMs: 60_000,
			closeClientIfIdleForMs: 60_000,
			...config,
		};

		if (this.config.observerDetectors !== null) {
			const slots = this.config.observerDetectors ?? {};

			for (const name of OBSERVER_SCOPE_DETECTOR_NAMES) {
				const slot = slots[name];

				if (slot === null) continue;

				this.addObserverDetector(name, slot ?? {});
			}
		}
	}

	public get numberOfCalls() {
		return this.observedCalls.size;
	}

	public get appData() {
		return this.config.appData;
	}

	public addObserverDetector<K extends keyof AvailableObserverScopeDetectorsConfigs>(name: K, config: Partial<AvailableObserverScopeDetectorsConfigs[K]> = {}): this {
		if (this.closed) return this;

		let detector: Detector | undefined;

		switch (name) {
			case SfuCongestionDetector.NAME: {
				detector = new SfuCongestionDetector(this, config);

				break;
			}
			case IceDisruptionDetector.NAME: {
				detector = new IceDisruptionDetector(this, config);

				break;
			}
			case ConcurrentIssueDetector.NAME: {
				detector = new ConcurrentIssueDetector(this, config);

				break;
			}
			case TurnServerHealthDetector.NAME: {
				detector = new TurnServerHealthDetector(this, config);

				break;
			}
			case TurnServerOutageDetector.NAME: {
				detector = new TurnServerOutageDetector(this, config);

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
	 * Enable a call-scoped detector for calls created **from now on**.
	 *
	 * This edits the config, not the live calls: calls already open keep the detector set they were
	 * built with. To add one to an existing call, use `observedCall.addDetector(...)` directly.
	 */
	public addCallDetector<K extends keyof AvailableCallScopeDetectorsConfigs>(name: K, config: Partial<AvailableCallScopeDetectorsConfigs[K]> = {}): this {
		if (this.closed) return this;

		// `null` means "no call detectors at all", and naming one is an explicit reversal of that —
		// so start from an empty set rather than silently doing nothing.
		if (!this.config.callDetectors) this.config.callDetectors = {};

		this.config.callDetectors[name] = config;

		return this;
	}

	/**
	 * Start a structural check. It runs on each `observer.update()` until it can decide, reports once
	 * on `validation-ready`, and removes itself.
	 *
	 * ```ts
	 * observer.validate('simulcast-receiver-validator', { minChecks: 5 });
	 * ```
	 *
	 * Config keys are optional and merged over that validator's defaults. Call it again — after a
	 * deploy, say — to check again; there is no revalidation timer, because a deploy rather than
	 * elapsed time is what makes a structural verdict stale.
	 */
	public addValidator<K extends keyof AvailableValidatorConfigs>(name: K, config: Partial<AvailableValidatorConfigs[K]> = {}): this {
		if (this.closed) return this;

		let validator: RunningValidator | undefined;
		const onDone = (report: ValidationReport) => {
			if (validator) this.validators.delete(validator);
			this._notify('validation-ready', { ...this.eventScope, report, validator: name });
		};

		switch (name) {
			case SimulcastReceiverValidator.NAME:
				validator = new SimulcastReceiverValidator(this, onDone, config);
				break;
		}

		if (!validator) {
			logger.warn('Unknown validator name %s; skipping', name);

			return this;
		}

		this.validators.add(validator);

		return this;
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
			closeCallIfEmptyForMs: settings.closeCallIfEmptyForMs ?? this.config.closeCallIfEmptyForMs,
			appData: settings.appData ?? this.config.createCallAppData?.({ callId: settings.callId, observer: this }),
		} as ObservedCallSettings<T>;

		const callActiveIssuesRegistry = new ActiveIssuesRegistry(this.activeIssuesRegistry);
		const observedCall = new ObservedCall(
			callSettings,
			this,
			callActiveIssuesRegistry
		);

		// Build the call's track resolver from the configured factory (if any).
		observedCall.remoteTrackResolver = this.config.createRemoteTrackResolver?.(observedCall);

		if (this.config.callDetectors !== null) {
			const slots = this.config.callDetectors ?? {};

			for (const name of CALL_SCOPE_DETECTOR_NAMES) {
				const detectorConfig = slots[name];

				if (detectorConfig === null) continue;

				observedCall.addDetector(name, detectorConfig ?? {});
			}
		}

		// A call is updated when any of its clients is; the observer is updated when any of its calls
		// is. Composed, that means the observer is updated exactly when any client anywhere is — no
		// timer, no separate policy object, nothing to keep in sync.
		if (this.config.autoUpdateOnCallUpdate) {
			const onCallUpdate = () => this.update();

			observedCall.once('close', () => observedCall.off('update', onCallUpdate));
			observedCall.on('update', onCallUpdate);
		}

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
			// When `true`, the observer emits `mediasoup-router-matched-with-peer-connection` for every
			// observed peer connection whose id matches one of this router's WebRTC transport ids.
			// When `false` / omitted, no peer-connection matching is performed.
			matchPeerConnectionByWebRtcTransportId?: boolean,
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

		// Peer-connection matching is opt-in (see `matchPeerConnectionByWebRtcTransportId`). When on,
		// emit `mediasoup-router-matched-with-peer-connection` for each peer connection whose id matches
		// one of the router's WebRTC transport ids; the observer stores nothing — the app owns the pairing.
		if (settings.matchPeerConnectionByWebRtcTransportId) {
			const onPeerConnectionAdded = (observedPeerConnectionScope: ObserverEvents['peer-connection-added'][0]) => {
				if (!observedMediasoupRouter.webrtcTransportIds.has(observedPeerConnectionScope.observedPeerConnection.peerConnectionId)) return;

				this.emit('mediasoup-router-matched-with-peer-connection', {
					...observedMediasoupRouterScope,
					...observedPeerConnectionScope,
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

		// Copy first: `call.close()` removes the call from this map, and mutating a Map while iterating
		// it with forEach skips entries — half the calls would survive a close.
		for (const call of [ ...this.observedCalls.values() ]) call.close();

		// Release detectors (they may hold bus subscriptions, timers, or tracker registrations) before
		// announcing the close.
		this.detectors.clear();
		// Free anything waiting on a verdict rather than leaving it hanging.
		for (const validator of [ ...this.validators ]) validator.cancel();
		this.validators.clear();
		// Each call cleared its own issues on close; this covers anything raised after that.
		this.activeIssuesRegistry.clear();

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
		this.detectors.update();
		// A validator removes itself the moment it decides, so this set is normally empty.
		for (const validator of [ ...this.validators ]) {
			try {
				validator.update();
			} catch (err) {
				logger.warn('Error running validator %s: %o', validator.name, err);
			}
		}

		this._notify('observer-updated', { ...this.eventScope });
	}

	/**
	 * Raise an observer-scoped (cross-call / SFU-wide) finding. Emitted on the bus as
	 * `observer-issue`. Intended for `observer.detectors`, but the application may call it too.
	 *
	 * `payload` takes an **object**; see `ObserverIssue`.
	 */
	public addIssue(issue: ObserverIssue) {
		if (this.closed) return;

		this._notify('observer-issue', { ...this.eventScope, issue });
	}

	/** Emit an Observer-bus event. */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.emit(type, ...args);
	}
}
