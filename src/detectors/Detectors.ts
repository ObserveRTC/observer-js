import { createLogger } from '../common/logger';
import { Detector } from './Detector';
import { CallConcurrentIssueDetector, CallConcurrentIssueDetectorConfig } from './CallConcurrentIssueDetector';
import { ClientPopulationIssueDetector, ClientPopulationIssueDetectorConfig } from './ClientPopulationIssueDetector';
import { PublisherFaultCorroborationDetector, PublisherFaultCorroborationDetectorConfig } from './PublisherFaultCorroborationDetector';
import { ObserverConcurrentIssueDetector, ObserverConcurrentIssueDetectorConfig } from './ObserverConcurrentIssueDetector';
import { IssueFanOutDetector, IssueFanOutDetectorConfig } from './IssueFanOutDetector';
import { SfuCongestionDetector, SfuCongestionDetectorConfig } from './SfuCongestionDetector';
import { TrackDeliveryMismatchDetector, TrackDeliveryMismatchDetectorConfig } from './TrackDeliveryMismatchDetector';
import { TurnServerHealthDetector, TurnServerHealthDetectorConfig } from './TurnServerHealthDetector';
import { TurnServerOutageDetector, TurnServerOutageDetectorConfig } from './TurnServerOutageDetector';
import { UnconsumedTrackDetector, UnconsumedTrackDetectorConfig } from './UnconsumedTrackDetector';

const logger = createLogger('Detectors');

/**
 * Detectors that reason **across calls**, created once on the observer.
 *
 * Adding one means: give the class a `static readonly NAME`, add its entry here, and add a `case` to
 * `Observer.addObserverDetector`. This map is what types the call site — the config is checked
 * against the right detector and an unknown name won't compile.
 */
export type AvailableObserverScopeDetectorsConfigs = {
	[SfuCongestionDetector.NAME]: SfuCongestionDetectorConfig;
	[ObserverConcurrentIssueDetector.NAME]: ObserverConcurrentIssueDetectorConfig;
	[ClientPopulationIssueDetector.NAME]: ClientPopulationIssueDetectorConfig;
	[TurnServerHealthDetector.NAME]: TurnServerHealthDetectorConfig;
	[TurnServerOutageDetector.NAME]: TurnServerOutageDetectorConfig;
};

/**
 * Detectors that reason **within one call**, created for every call the observer opens.
 *
 * Note there is no detector in both maps. "Is this meeting in trouble?" and "is our infrastructure in
 * trouble?" are different questions with different gates and different findings, so they are separate
 * classes — `CallConcurrentIssueDetector` and `ObserverConcurrentIssueDetector` — rather than one
 * class branching on what it was handed.
 */
export type AvailableCallScopeDetectorsConfigs = {
	[UnconsumedTrackDetector.NAME]: UnconsumedTrackDetectorConfig;
	[TrackDeliveryMismatchDetector.NAME]: TrackDeliveryMismatchDetectorConfig;
	[CallConcurrentIssueDetector.NAME]: CallConcurrentIssueDetectorConfig;
	[IssueFanOutDetector.NAME]: IssueFanOutDetectorConfig;
	[PublisherFaultCorroborationDetector.NAME]: PublisherFaultCorroborationDetectorConfig;
};

export type AvailableDetectorsConfigs =
	| AvailableObserverScopeDetectorsConfigs
	| AvailableCallScopeDetectorsConfigs;

export class Detectors {
	private _detectors: Detector[];

	public constructor(...detectors: Detector[]) {
		this._detectors = detectors;
	}

	/**
	 * Every registered detector, in registration order.
	 *
	 * This is **the** way to get hold of an instance: `addDetector` / `addObserverDetector` are
	 * chainable and return the owning entity, so the registry is where instances live. Read it to
	 * inspect a detector's state, or to pick one out and {@link remove} it.
	 *
	 * A copy, not the live array — a caller iterating this while removing would otherwise skip
	 * entries, and that is exactly what "remove the ones that look like X" does.
	 */
	public get instances(): Detector[] {
		return [ ...this._detectors ];
	}

	/** Iterate the registry directly: `for (const detector of call.detectors)`. */
	public [Symbol.iterator](): IterableIterator<Detector> {
		return this.instances[Symbol.iterator]();
	}

	/** The names in registration order. Duplicates are meaningful — see {@link getAll}. */
	public get listOfNames() {
		return this._detectors.map((d) => d.name);
	}

	public get size() {
		return this._detectors.length;
	}

	public add(detector: Detector) {
		this._detectors.push(detector);
	}

	/** The first detector registered under `name`. See {@link getAll} when several can share one. */
	public get(name: string): Detector | undefined {
		return this._detectors.find((detector) => detector.name === name);
	}

	/**
	 * Every detector registered under `name`.
	 *
	 * More than one is legitimate: `ClientPopulationIssueDetector` is meant to be added once per
	 * `groupBy` axis, and two instances of it share a name.
	 */
	public getAll(name: string): Detector[] {
		return this._detectors.filter((detector) => detector.name === name);
	}

	public has(name: string): boolean {
		return this._detectors.some((detector) => detector.name === name);
	}

	/** Remove one specific instance. Returns `false` if it was not registered here. */
	public remove(detector: Detector): boolean {
		const remaining = this._detectors.filter((candidate) => candidate !== detector);

		if (remaining.length === this._detectors.length) return false;

		this._detectors = remaining;
		this._close(detector);

		return true;
	}

	/**
	 * Remove **every** detector registered under `name`, returning how many were removed.
	 *
	 * All of them rather than the first, because a name can legitimately be registered more than once
	 * (see {@link getAll}) and "remove the `client-population-issue-detector`" cannot sensibly mean
	 * "remove whichever axis happens to be first in the array". Removing all of them is the only
	 * behaviour that leaves the registry in a state the caller can predict from the name alone.
	 *
	 * Each removed detector gets `close()`, so trackers unsubscribe from the issue registry, bus
	 * listeners drop, and timers clear — a detector removed without closing keeps being fed issues
	 * forever.
	 */
	public removeByName(name: string): number {
		const removed = this._detectors.filter((detector) => detector.name === name);

		if (removed.length === 0) return 0;

		this._detectors = this._detectors.filter((detector) => detector.name !== name);
		for (const detector of removed) this._close(detector);

		return removed.length;
	}

	public update() {
		for (const detector of this._detectors) {
			try {
				detector.update();
			} catch (err) {
				logger.warn(`Error updating detector ${detector?.name}`, err);
			}
		}
	}

	public clear() {
		const detectors = this._detectors;

		this._detectors = [];
		for (const detector of detectors) this._close(detector);
	}

	private _close(detector: Detector) {
		try {
			detector.close?.();
		} catch (err) {
			logger.warn(`Error closing detector ${detector?.name}`, err);
		}
	}
}
