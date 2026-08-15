import { createLogger } from '../common/logger';
import { Detector } from './Detector';
import { ConcurrentIssueDetector, ConcurrentIssueDetectorConfig } from './ConcurrentIssueDetector';
import { IceDisruptionDetector, IceDisruptionDetectorConfig } from './IceDisruptionDetector';
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
	[IceDisruptionDetector.NAME]: IceDisruptionDetectorConfig;
	[ConcurrentIssueDetector.NAME]: ConcurrentIssueDetectorConfig;
	[TurnServerHealthDetector.NAME]: TurnServerHealthDetectorConfig;
	[TurnServerOutageDetector.NAME]: TurnServerOutageDetectorConfig;
};

/**
 * Detectors that reason **within one call**, created for every call the observer opens.
 *
 * `ConcurrentIssueDetector` appears in both maps on purpose: at call scope it asks "is this meeting
 * in trouble?", at observer scope "is our infrastructure in trouble?". Those are different questions
 * with different gates, not one question with a bigger denominator.
 */
export type AvailableCallScopeDetectorsConfigs = {
	[UnconsumedTrackDetector.NAME]: UnconsumedTrackDetectorConfig;
	[TrackDeliveryMismatchDetector.NAME]: TrackDeliveryMismatchDetectorConfig;
	[ConcurrentIssueDetector.NAME]: ConcurrentIssueDetectorConfig;
	[IssueFanOutDetector.NAME]: IssueFanOutDetectorConfig;
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
