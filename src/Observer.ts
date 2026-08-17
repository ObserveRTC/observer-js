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
import type { ObserverIssue } from './common/Issue';
import { ActiveIssuesRegistry } from './issues/ActiveIssuesRegistry';
import { CallSummaryCollector } from './summaries/CallSummaryCollector';
import { defaultCallSummaryConfig, type CallSummaryConfig } from './summaries/CallSummary';
import type { Detector } from './detectors/Detector';
import { SfuCongestionDetector } from './detectors/SfuCongestionDetector';
import { ObserverConcurrentIssueDetector } from './detectors/ObserverConcurrentIssueDetector';
import { ClientPopulationIssueDetector } from './detectors/ClientPopulationIssueDetector';
import { TurnServerHealthDetector } from './detectors/TurnServerHealthDetector';
import { TurnServerOutageDetector } from './detectors/TurnServerOutageDetector';
import { SimulcastReceiverValidator } from './validators/SimulcastReceiverValidator';
import { RemoteTrackResolverValidator } from './validators/RemoteTrackResolverValidator';
import { CodecConsistencyValidator } from './validators/CodecConsistencyValidator';

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
export type CallAppDataFactory = (params: { callId: string, observer: Observer, acceptCtx?: AcceptContext }) => Record<string, unknown>;

/** Produces the initial `appData` for a client created without an explicit `appData`. */
export type ClientAppDataFactory = (params: { clientId: string, observedCall: ObservedCall, acceptCtx?: AcceptContext }) => Record<string, unknown>;

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

	/**
	 * Accumulate a {@link CallSummary} on every call this observer creates.
	 *
	 * **Absent or `null` means no summaries at all** — no accumulation, and not one bus subscription.
	 * Pass an object (`{}` is valid) to switch it on; anything you leave out takes its default from
	 * `defaultCallSummaryConfig`, including `include: []`, which collects *no* built-in section. A
	 * summary that only runs `enrich` is a perfectly good summary.
	 *
	 * ```ts
	 * const observer = new Observer({
	 *   callSummary: {
	 *     include: [ 'clients', 'issues' ],
	 *     enrich: {
	 *       'client-joined': (summary, { observedClient }) => {
	 *         ((summary.attachments.regions ??= []) as string[]).push(String(observedClient.appData.region));
	 *       },
	 *     },
	 *   },
	 * });
	 *
	 * observer.on('call-summary', ({ summary }) => archive(summary));
	 * ```
	 *
	 * This is construction-time and fixed for the observer's life, unlike detectors, which are added
	 * per call as an application decides what to watch. A summary is a record of what happened, and a
	 * record you can turn on halfway through is a record with a hole in it — calls that started
	 * earlier would carry different sections from calls that started later, with nothing on either to
	 * say which. One shape for every call, or none.
	 */
	callSummary?: Partial<CallSummaryConfig> | null;

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
	 * Starts **empty**. Populate it with {@link addObserverDetector}, or `detectors.add(...)` for an
	 * instance you built yourself.
	 */
	public readonly detectors = new Detectors();

	/**
	 * The call-scoped detectors to build on **every** call this observer creates, in registration
	 * order. Written by {@link addCallDetector}; read by `createObservedCall`.
	 *
	 * Nothing is created implicitly. There is no detector configuration in `ObserverConfig` and no
	 * default set, because a detector that nobody asked for is a detector nobody will act on: it costs
	 * time on every tick and raises findings into a handler that was not written to expect them. An
	 * application says what it wants to watch, or it watches nothing.
	 *
	 * ```ts
	 * observer.addCallDetector('call-concurrent-issue-detector', {
	 *   issueTypes: [ 'congestion', 'ice-disconnected' ],
	 * });
	 * ```
	 */
	public readonly callDetectorConfigs = new Map<
	keyof AvailableCallScopeDetectorsConfigs,
	Partial<AvailableCallScopeDetectorsConfigs[keyof AvailableCallScopeDetectorsConfigs]>
	>();

	/**
	 * Owns every call's summary: the resolved `config.callSummary`, the bus subscriptions that keep
	 * the summaries current (one per event type, not one per call), and the summaries themselves.
	 *
	 * `undefined` when `config.callSummary` was absent or `null` — so its presence *is* the answer to
	 * "are summaries on", and nothing is subscribed to anything.
	 */
	public readonly callSummaryCollector?: CallSummaryCollector;

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

		if (this.config.callSummary) {
			// The defaults are resolved once, here, and the collector is the only thing that holds the
			// result — there is no second copy on the observer to drift from `config`. One collector
			// holds one subscription per event type it needs, not one per call; see
			// `CallSummaryCollector` for why the per-call alternative is quadratic in concurrent calls.
			this.callSummaryCollector = new CallSummaryCollector(this, {
				...defaultCallSummaryConfig,
				...this.config.callSummary,
			});
		}
	}

	public get numberOfCalls() {
		return this.observedCalls.size;
	}

	public get appData() {
		return this.config.appData;
	}

	/**
	 * Build a cross-call detector onto `observer.detectors`. Chainable.
	 *
	 * To get a handle on what was built — to inspect it, or to remove that exact instance later — read
	 * it back off the registry: `observer.detectors.getAll(name)`, or `observer.detectors.instances`.
	 */
	public addObserverDetector<K extends keyof AvailableObserverScopeDetectorsConfigs>(name: K, config: Partial<AvailableObserverScopeDetectorsConfigs[K]> = {}): this {
		if (this.closed) return this;

		let detector: Detector | undefined;

		switch (name) {
			case SfuCongestionDetector.NAME: {
				detector = new SfuCongestionDetector(this, config);

				break;
			}
			case ObserverConcurrentIssueDetector.NAME: {
				detector = new ObserverConcurrentIssueDetector(this, config);

				break;
			}
			case ClientPopulationIssueDetector.NAME: {
				detector = new ClientPopulationIssueDetector(this, config);

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

		this.callDetectorConfigs.set(name, config);

		return this;
	}

	/**
	 * Remove an observer-scoped detector by name, returning how many were removed.
	 *
	 * **Every** instance registered under the name goes, since a name can legitimately be registered
	 * more than once (`ClientPopulationIssueDetector` is meant to be added once per `groupBy` axis).
	 * When you want one of them specifically, go through the registry, which deals in instances:
	 *
	 * ```ts
	 * const [ byBrowser, byOs ] = observer.detectors.getAll('client-population-issue-detector');
	 *
	 * observer.detectors.remove(byOs);   // keeps the browser axis running
	 * ```
	 *
	 * Either route `close()`s the detector, so it unsubscribes from the issue registry and drops any
	 * timers or bus listeners it held.
	 */
	public removeObserverDetector(name: keyof AvailableObserverScopeDetectorsConfigs): number {
		return this.detectors.removeByName(name);
	}

	/**
	 * Stop building `name` on calls created from now on.
	 *
	 * By default this also removes it from the calls **already open**, so that "remove this detector"
	 * means the same thing whether you say it before or after a call started — the alternative leaves
	 * a fleet where the detector is live on some calls and not others, decided by join time. Pass
	 * `{ includeOpenCalls: false }` to change only what future calls are built with.
	 *
	 * Returns the number of live detector instances removed (`0` when only the config changed).
	 */
	public removeCallDetector(
		name: keyof AvailableCallScopeDetectorsConfigs,
		{ includeOpenCalls = true }: { includeOpenCalls?: boolean } = {},
	): number {
		this.callDetectorConfigs.delete(name);

		if (!includeOpenCalls) return 0;

		let removed = 0;

		for (const call of this.observedCalls.values()) removed += call.removeDetector(name);

		return removed;
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
			case RemoteTrackResolverValidator.NAME:
				validator = new RemoteTrackResolverValidator(this, onDone, config);
				break;
			case CodecConsistencyValidator.NAME:
				validator = new CodecConsistencyValidator(this, onDone, config);
				break;
		}

		if (!validator) {
			logger.warn('Unknown validator name %s; skipping', name);

			return this;
		}

		this.validators.add(validator);

		return this;
	}

	/**
	 * Stop a running validation, by name or by instance. Returns how many were cancelled.
	 *
	 * Cancelling is **not** silent discarding. The validator finishes with `inconclusive` and the given
	 * `reason`, emits `validation-ready` like any other completion, and removes itself. That matters
	 * because anything waiting on the verdict — a deploy gate, a dashboard, a promise — would otherwise
	 * wait forever, and because "we stopped asking" is a materially different outcome from "we asked
	 * and learned nothing", which is exactly what `inconclusive` with a reason records.
	 *
	 * ```ts
	 * observer.cancelValidator('simulcast-receivers', 'sfu redeployed');
	 *
	 * // or one specific instance — `observer.validators` holds what is running
	 * for (const validator of observer.validators) observer.cancelValidator(validator, 'shutting down');
	 * ```
	 *
	 * Pass a real reason. The default tells the reader nothing they could not already infer.
	 */
	public cancelValidator(target: keyof AvailableValidatorConfigs | RunningValidator, reason = 'cancelled'): number {
		// Copy first: `cancel()` finishes the validator, whose `onDone` deletes it from this very set.
		const running = [ ...this.validators ];
		const matching = typeof target === 'string'
			? running.filter((validator) => validator.name === target)
			: running.filter((validator) => validator === target);

		for (const validator of matching) {
			try {
				validator.cancel(reason);
			} catch (err) {
				logger.warn('Error cancelling validator %s: %o', validator.name, err);
			}
		}

		return matching.length;
	}

	public getObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(callId: string): ObservedCall<T> | undefined {
		if (this.closed || !this.observedCalls.has(callId)) return;

		return this.observedCalls.get(callId) as ObservedCall<T>;
	}

	/**
	 * @param acceptCtx the `accept()` context, when this call is being created to receive a sample.
	 * Passed on to `ObserverConfig.createCallAppData`, so the factory can read whatever the caller (or
	 * an accept middleware) put there — a tenant, a region, a trace id.
	 */
	public createObservedCall<T extends Record<string, unknown> = Record<string, unknown>>(
		settings: ObservedCallSettings<T>, acceptCtx?: AcceptContext
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
			appData: settings.appData ?? this.config.createCallAppData?.({ callId: settings.callId, observer: this, acceptCtx }),
		} as ObservedCallSettings<T>;

		const callActiveIssuesRegistry = new ActiveIssuesRegistry(this.activeIssuesRegistry);
		const observedCall = new ObservedCall(
			callSettings,
			this,
			callActiveIssuesRegistry
		);

		// Build the call's track resolver from the configured factory (if any).
		observedCall.remoteTrackResolver = this.config.createRemoteTrackResolver?.(observedCall);

		observedCall.enableSummary();

		// Exactly what the application registered, in registration order. Nothing is created
		// implicitly: a call with no configured detectors runs none.
		for (const [ name, detectorConfig ] of this.callDetectorConfigs) {
			observedCall.addDetector(name, detectorConfig);
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
		settings: ObservedCallSettings<T>, acceptCtx?: AcceptContext
	): ObservedCall<T> | undefined {
		return this.getObservedCall<T>(settings.callId) ?? this.createObservedCall<T>(settings, acceptCtx);
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
		for (const validator of [ ...this.validators ]) validator.cancel('observer closed');
		this.validators.clear();
		// After the calls, so each one's `call-summary` still fires with its subscriptions intact.
		this.callSummaryCollector?.close();
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

		// The context is handed to the create methods rather than used to pre-compute `appData` here:
		// they already run the factories for anything created without explicit `appData`, and calling
		// them from both places is two implementations of one rule, waiting to disagree.
		const call = this.getOrCreateObservedCall({ callId: sample.callId }, context);

		if (!call) return;

		const client = call.getOrCreateObservedClient({ clientId: sample.clientId }, context);

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
	public addIssue(issue: Omit<ObserverIssue, 'scope'>) {
		if (this.closed) return;

		// `scope` is stamped here rather than asked of every caller: it is a fact about *where the
		// finding was raised*, which this object knows and a detector should not have to restate.
		this._notify('observer-issue', { ...this.eventScope, issue: { ...issue, scope: 'observer' } });
	}

	/** Emit an Observer-bus event. */
	private _notify<K extends keyof ObserverEvents>(type: K, ...args: ObserverEvents[K]): void {
		this.emit(type, ...args);
	}
}
