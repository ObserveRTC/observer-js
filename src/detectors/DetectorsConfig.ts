import type { Observer } from '../Observer';
import type { ObservedCall } from '../ObservedCall';
import { Detectors } from './Detectors';

import { ConcurrentIssueDetector, ConcurrentIssueDetectorConfig } from './ConcurrentIssueDetector';
import { IssueFanOutDetector, IssueFanOutDetectorConfig } from './IssueFanOutDetector';
import { TrackDeliveryMismatchDetector, TrackDeliveryMismatchDetectorConfig } from './TrackDeliveryMismatchDetector';
import { UnconsumedTrackDetector, UnconsumedTrackDetectorConfig } from './UnconsumedTrackDetector';
import { IceDisruptionDetector, IceDisruptionDetectorConfig } from './IceDisruptionDetector';
import { TurnServerHealthDetector, TurnServerHealthDetectorConfig } from './TurnServerHealthDetector';
import { TurnServerOutageDetector, TurnServerOutageDetectorConfig } from './TurnServerOutageDetector';

/**
 * Per-detector configuration slot.
 *
 * Three states, and the distinction between the last two is the entire point:
 *
 * - **omitted / `undefined`** — the detector is created with its defaults.
 * - **an object** — created with those overrides merged over the defaults.
 * - **`null`** — *not created at all*.
 *
 * This mirrors `client-monitor-js`, deliberately: the same mental model should apply on both sides
 * of the wire. `undefined` cannot mean "off", because that would make every detector opt-in again
 * and the common case (`new Observer()`) would silently detect nothing.
 *
 * The values an omitted slot resolves to are spelled out in `Observer.ts`
 * (`defaultCallDetectorsConfig` / `defaultObserverDetectorsConfig`).
 */
export type DetectorSlot<T> = Partial<T> | null;

/**
 * Detectors that reason **within one call** — created for every call the observer opens.
 *
 * All of them are issue-driven: they consume the verdicts `client-monitor-js` >= 4.6.0 already ships
 * (raise + `<type>-resolved`) and add only the cross-participant conclusion. None re-derives a
 * per-endpoint verdict from raw counters.
 */
export type CallDetectorsConfig = {

	/** Many clients of the call in the same reported state at once. */
	concurrentIssueDetector: DetectorSlot<ConcurrentIssueDetectorConfig>;

	/** How far a receiver-reported issue fans out across one published track's subscribers. */
	issueFanOutDetector: DetectorSlot<IssueFanOutDetectorConfig>;

	/** Publisher sending but subscribers dry — separates SFU forwarding faults from a muted source. */
	trackDeliveryMismatchDetector: DetectorSlot<TrackDeliveryMismatchDetectorConfig>;

	/** A track being published that nobody receives. Requires a `RemoteTrackResolver`. */
	unconsumedTrackDetector: DetectorSlot<UnconsumedTrackDetectorConfig>;

	/**
	 * ICE disruption storm, read from **raw ICE state transitions** rather than client issues.
	 * The fallback path for clients that don't run `client-monitor-js` >= 4.6.0 — and the only one
	 * that catches flaps occurring between two `update()` ticks.
	 */
	iceDisruptionDetector: DetectorSlot<IceDisruptionDetectorConfig>;

};

/**
 * The **complete** config for every call-scoped detector — one fully specified object each, no
 * `Partial`. `ObserverConfig` supplies this (see `defaultCallDetectorsConfig` in `Observer.ts`), and
 * the factory below merges each user override on top before constructing.
 *
 * Typed this way so adding a field to any detector's config fails to compile until a default is
 * supplied in that one table: a threshold with no visible default is a threshold nobody finds.
 */
export type CallDetectorDefaults = {
	[K in keyof CallDetectorsConfig]-?: NonNullable<CallDetectorsConfig[K]> extends Partial<infer C> ? C : never;
};

/** Detectors that reason **across calls** — created once, on the observer itself. */
export type ObserverDetectorsConfig = {

	/** Clients across *different* calls in the same state at once — an infrastructure fingerprint. */
	concurrentIssueDetector: DetectorSlot<ConcurrentIssueDetectorConfig>;

	/** One TURN server's clients unhappy while other servers' clients are fine. */
	turnServerHealthDetector: DetectorSlot<TurnServerHealthDetectorConfig>;

	/** One TURN server's population collapsing while the rest of the fleet carries on. */
	turnServerOutageDetector: DetectorSlot<TurnServerOutageDetectorConfig>;
};

/** The **complete** config for every observer-scoped detector. See {@link CallDetectorDefaults}. */
export type ObserverDetectorDefaults = {
	[K in keyof ObserverDetectorsConfig]-?: NonNullable<ObserverDetectorsConfig[K]> extends Partial<infer C> ? C : never;
};

/**
 * Applies the `undefined` → defaults, `null` → disabled rule.
 *
 * `undefined` and `null` are load-bearing and distinct here, so this deliberately does not use
 * `??`: `value ?? {}` would resurrect a detector the caller explicitly turned off.
 */
export function detectorSlot<T>(value: DetectorSlot<T> | undefined): Partial<T> | null {
	return value === undefined ? {} : value;
}

/**
 * Instantiates the call-scoped detectors enabled by `config` onto `call.detectors`.
 *
 * `defaults` is the complete set; each enabled slot is built from `{ ...defaults[key], ...override }`,
 * so a caller naming one key never loses the others' defaults.
 */
export function createCallDetectors(
	call: ObservedCall,
	config: Partial<CallDetectorsConfig> = {},
	defaults: CallDetectorDefaults,
): Detectors {
	const detectors = call.detectors;
	const add = <C, D>(slot: DetectorSlot<C> | undefined, base: C, build: (c: C) => D) => {
		const resolved = detectorSlot(slot);

		if (resolved === null) return;
		detectors.add(build({ ...base, ...resolved }) as never);
	};

	add(config.concurrentIssueDetector, defaults.concurrentIssueDetector, (c) => new ConcurrentIssueDetector(call, c));
	add(config.issueFanOutDetector, defaults.issueFanOutDetector, (c) => new IssueFanOutDetector(call, c));
	add(config.trackDeliveryMismatchDetector, defaults.trackDeliveryMismatchDetector, (c) => new TrackDeliveryMismatchDetector(call, c));
	add(config.unconsumedTrackDetector, defaults.unconsumedTrackDetector, (c) => new UnconsumedTrackDetector(call, c));
	add(config.iceDisruptionDetector, defaults.iceDisruptionDetector, (c) => new IceDisruptionDetector(call, c));

	return detectors;
}

/** Instantiates the observer-scoped detectors enabled by `config` onto `observer.detectors`. */
export function createObserverDetectors(
	observer: Observer,
	config: Partial<ObserverDetectorsConfig> = {},
	defaults: ObserverDetectorDefaults,
): Detectors {
	const detectors = observer.detectors;
	const add = <C, D>(slot: DetectorSlot<C> | undefined, base: C, build: (c: C) => D) => {
		const resolved = detectorSlot(slot);

		if (resolved === null) return;
		detectors.add(build({ ...base, ...resolved }) as never);
	};

	add(config.concurrentIssueDetector, defaults.concurrentIssueDetector, (c) => new ConcurrentIssueDetector(observer, c));
	add(config.turnServerHealthDetector, defaults.turnServerHealthDetector, (c) => new TurnServerHealthDetector(observer, c));
	add(config.turnServerOutageDetector, defaults.turnServerOutageDetector, (c) => new TurnServerOutageDetector(observer, c));

	return detectors;
}
