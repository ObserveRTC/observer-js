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

	public get listOfNames() {
		return this._detectors.map((d) => d.name);
	}

	public get size() {
		return this._detectors.length;
	}

	public add(detector: Detector) {
		this._detectors.push(detector);
	}

	public get(name: string): Detector | undefined {
		return this._detectors.find((detector) => detector.name === name);
	}

	public remove(detector: Detector) {
		this._detectors = this._detectors.filter((d) => d !== detector);
		this._close(detector);
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
