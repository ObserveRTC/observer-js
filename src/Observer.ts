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
import { AvailableCallScopeDetectorsConfigs, AvailableDetectorsConfigs, AvailableObserverScopeDetectorsConfigs, Detectors } from './detectors/Detectors';
import type { AvailableValidatorConfigs } from './validators/Validators';
import type { ValidationReport, RunningValidator } from './validators/Validator';
import {
	createCallDetectors,
	type CallDetectorsConfig,
	type ObserverDetectorsConfig,
	type CallDetectorDefaults,
	type ObserverDetectorDefaults,
} from './detectors/DetectorsConfig';
import type { ObserverIssue } from './common/ObserverIssue';
import { ActiveIssuesRegistry } from './issues/ActiveIssuesRegistry';
import { SfuCongestionDetector, SfuCongestionDetectorConfig } from './detectors/SfuCongestionDetector';
import { Detector, IceDisruptionDetector, SimulcastReceiverValidator } from '.';

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
	 * If true, every call update triggers an observer-wide `update()` pass. If false, the app must manually trigger updates.
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
	 * Each key is `undefined` (create with the values in `defaultObserverDetectorsConfig`), an object
	 * (those keys merged over the defaults), or `null` (don't create). Set the whole property to
	 * `null` to run with no observer-scoped detectors.
	 *
	 * ```ts
	 * new Observer({
	 *   observerDetectors: {
	 *     turnServerOutageDetector: { minClientsAtPeak: 10 },
	 *     concurrentIssueDetector: null,
	 *   },
	 * });
	 * ```
	 */
	observerDetectors?: {
		[K in keyof AvailableObserverScopeDetectorsConfigs]?: Partial<AvailableObserverScopeDetectorsConfigs[K]> | null;
	}

	/**
	 * Call-scoped detectors, applied to **every call** this observer creates. Same three-state
	 * semantics as `observerDetectors`, resolving against `defaultCallDetectorsConfig`. A call can
	 * override this wholesale via `ObservedCallSettings.detectors`.
	 */
	callDetectors?: {
		[K in keyof AvailableCallScopeDetectorsConfigs]?: Partial<AvailableCallScopeDetectorsConfigs[K]> | null;
	}

}

/* ================================================================================================
 * Detector defaults
 *
 * Every threshold the library applies out of the box is in these two objects and nowhere else. They
 * used to be a `defaultConfig` inside each detector file, which meant answering "what does this do
 * if I configure nothing?" required opening eight files and trusting you had found them all.
 *
 * Seeing them together also makes the *relationships* legible, which per-file constants hid:
 *
 *  - `cooldownMs` rises with how expensive the finding is to act on. Quality correlations re-arm
 *    after a minute; the windowed one waits two, because re-reporting mid-window says nothing new;
 *    the two that mean "somebody has to go look at a server" wait five.
 *  - Ratios encode how much agreement each question needs. A call-wide claim needs half the
 *    participants; a claim about one published track needs most of its subscribers; a *delivery*
 *    claim needs all of them, because "some receivers are dry" is a different verdict from "the
 *    track is not being delivered".
 *  - Minimum populations are the anti-coincidence floor: three participants before a ratio means
 *    anything, five clients before one TURN server can be compared against another.
 *
 * Both are exported, so you can read or spread them instead of copying magic numbers:
 * `{ ...defaultCallDetectorsConfig.concurrentIssueDetector, minClients: 5 }`.
 *
 * The types are complete (no `Partial`), so adding a field to any detector's config fails to compile
 * until its default is supplied here — a threshold with no visible default is one nobody finds.
 * ============================================================================================== */

/** Defaults for the detectors created on **every call**. */
export const defaultCallDetectorsConfig: CallDetectorDefaults = {

	/** Many participants of one call in the same reported state at once. */
	concurrentIssueDetector: {
		// empty = every type the clients report
		issueTypes: [],
		minClients: 3,
		minAffectedClients: 3,
		affectedRatioThreshold: 0.5,
		// observer scope only; ignored here
		minAffectedCalls: 2,
		// observer scope only; ignored here
		affectedCallRatioThreshold: 0,
		onsetBurstWindowInMs: 2_000,
		cooldownMs: 60_000,
	},

	/** How far a receiver-reported issue fans out across one published track's subscribers. */
	issueFanOutDetector: {
		issueTypes: [],
		minReceivers: 3,
		// "most subscribers of this track"
		affectedRatioThreshold: 0.6,
		reportSingleReceiver: true,
		cooldownMs: 60_000,
	},

	/** Publisher sending but subscribers dry. */
	trackDeliveryMismatchDetector: {
		dryInboundIssueType: 'dry-inbound-track',
		dryOutboundIssueType: 'dry-outbound-track',
		minReceivers: 2,
		// ALL of them: anything less is a per-consumer fault, not a delivery failure
		allReceiversRatio: 1,
		cooldownMs: 60_000,
	},

	/** A track published to nobody. */
	unconsumedTrackDetector: {
		// wall clock, not sample time; a gap before the first subscription is normal at join
		minUnconsumedDurationInMs: 30_000,
		minBitrate: 50_000,
		cooldownMs: 300_000,
	},

	/** Many clients losing ICE inside one window, read from raw state transitions. */
	iceDisruptionDetector: {
		minClients: 3,
		affectedRatioThreshold: 0.5,
		windowMs: 10_000,
		cooldownMs: 60_000,
	},
};

/** Defaults for the detectors created once, on the **observer**. */
export const defaultObserverDetectorsConfig: ObserverDetectorDefaults = {

	// Deliberately the same object as the call-scoped entry: the thresholds are identical, and the
	// scopes differ in which of them apply (`minAffectedCalls` gates here, `affectedRatioThreshold`
	// gates there). Duplicating the literal would let the two drift apart for no reason.
	concurrentIssueDetector: defaultCallDetectorsConfig.concurrentIssueDetector,

	/** Trouble clustering on one TURN relay while other relays are fine. */
	turnServerHealthDetector: {
		minClientsPerServer: 5,
		degradedRatioThreshold: 0.5,
		// any open issue: the question is where trouble clusters, not what it is
		issueTypes: [],
		consecutiveTicks: 2,
		cooldownMs: 60_000,
	},

	/** One TURN relay's population collapsing while the fleet carries on. */
	turnServerOutageDetector: {
		minClientsAtPeak: 5,
		// an outage is near-total by definition; partial degradation is the health detector's question
		lossRatioThreshold: 0.8,
		peakWindowMs: 120_000,
		// absence without a control group is just quiet
		requireControlGroup: true,
		minControlGroupClients: 5,
		controlGroupHealthyRatio: 0.7,
		consecutiveTicks: 2,
		// one event, not one per tick
		cooldownMs: 300_000,
	},
};


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
		}

		if (this.config.observerDetectors) {
			for (const [ name, config ] of Object.entries(this.config.observerDetectors)) {
				if (config === null) continue;

				this.addObserverDetector(name as keyof AvailableObserverScopeDetectorsConfigs, config);
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
			case 'sfu-congestion-detector': {
				detector = new SfuCongestionDetector(this, config);

				break;
			}
			case 'ice-disruption-detector': {
				detector = new IceDisruptionDetector(this, config);

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

	public addCallDetector<K extends keyof AvailableCallScopeDetectorsConfigs>(name: K, config: Partial<AvailableCallScopeDetectorsConfigs[K]> = {}): this {
		if (this.closed) return this;
		if (this.config.callDetectors === undefined) this.config.callDetectors = {};

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
			case 'simulcast-receivers':
				validator = new SimulcastReceiverValidator(
					this,
					onDone,
					config,
				);
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

		if (this.config.callDetectors) {
			for (const [ name, config ] of Object.entries(this.config.callDetectors)) {
				if (config === null) continue;

				observedCall.addDetector(name as keyof AvailableCallScopeDetectorsConfigs, config);
			}
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

		this.observedCalls.forEach((call) => call.close());
		// Release detectors (they may hold bus subscriptions) before announcing the close.
		this.detectors.clear();
		// Free anything waiting on a verdict rather than leaving it hanging.
		for (const validator of [ ...this.validators ]) validator.cancel();
		this.validators.clear();

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
