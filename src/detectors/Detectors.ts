import { createLogger } from '../common/logger';
import { Detector } from './Detector';
import { IceDisruptionDetector, IceDisruptionDetectorConfig } from './IceDisruptionDetector';
import { SfuCongestionDetector, SfuCongestionDetectorConfig } from './SfuCongestionDetector';
import { TrackDeliveryMismatchDetector, TrackDeliveryMismatchDetectorConfig } from './TrackDeliveryMismatchDetector';
import { UnconsumedTrackDetector, UnconsumedTrackDetectorConfig } from './UnconsumedTrackDetector';

const logger = createLogger('Detectors');

export type AvailableObserverScopeDetectorsConfigs = {
	[SfuCongestionDetector.NAME]: SfuCongestionDetectorConfig;
	[IceDisruptionDetector.NAME]: IceDisruptionDetectorConfig;
}

export type AvailableCallScopeDetectorsConfigs = {
	[UnconsumedTrackDetector.NAME]: UnconsumedTrackDetectorConfig;
	[TrackDeliveryMismatchDetector.NAME]: TrackDeliveryMismatchDetectorConfig;
}

export type AvailableDetectorsConfigs =
| AvailableObserverScopeDetectorsConfigs
| AvailableCallScopeDetectorsConfigs
;

export class Detectors {
	private _detectors: Detector[];

	public constructor(...detectors: Detector[]) {
		this._detectors = detectors;
	}

	public get listOfNames() {
		return this._detectors.map((d) => d.name);
	}

	public add(detector: Detector) {
		this._detectors.push(detector);
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
