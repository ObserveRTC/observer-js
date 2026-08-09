import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import {
	defaultReceiverHealthThresholds,
	ObservedTrackDistribution,
	ReceiverHealthThresholds,
	TrackDistributionAggregator,
} from '../utils/TrackDistributionAggregator';
import { SlidingWindow } from '../utils/stats';

export const PliAndFreezeFanOutTypes = {
	/** Many receivers of the same publisher requested keyframes at once. */
	publisherPliStorm: 'PUBLISHER_PLI_STORM',

	/** Many receivers of the same publisher froze at once. */
	publishedVideoFrozenForMultipleReceivers: 'PUBLISHED_VIDEO_FROZEN_FOR_MULTIPLE_RECEIVERS',
} as const;

export type PliAndFreezeFanOutDetectorConfig = {

	/** Minimum receivers of the track before a fan-out ratio is meaningful. Default `3`. */
	minReceivers: number;

	/** Fraction of receivers that must be affected within the window. Default `0.5`. */
	affectedRatioThreshold: number;

	/** The correlation window (ms) symptoms are counted over. Default `10_000`. */
	windowMs: number;

	/** Minimum PLIs across receivers inside the window before a storm is declared. Default `5`. */
	minPliCount: number;

	/** Re-arm time (ms) before the same finding can be raised again for a track. Default `30_000`. */
	cooldownMs: number;

	thresholds?: Partial<ReceiverHealthThresholds>;
};

const defaultConfig: PliAndFreezeFanOutDetectorConfig = {
	minReceivers: 3,
	affectedRatioThreshold: 0.5,
	windowMs: 10_000,
	minPliCount: 5,
	cooldownMs: 30_000,
};

type TrackWindow = {

	/** Per-tick samples of which receivers were affected, inside the window. */
	pli: SlidingWindow<{ receivers: string[], count: number }>;
	freeze: SlidingWindow<{ receivers: string[], count: number }>;
	lastRaisedAt: Map<string, number>;
};

/**
 * Detects **fan-out** symptoms: one publisher's stream causing many receivers to request keyframes
 * (PLI) or to freeze within the same window.
 *
 * A single receiver sending PLIs is unremarkable — it lost some packets. Nineteen of twenty
 * receivers of the *same* source doing it inside ten seconds is not twenty coincidental network
 * faults; it points at the source's output, the SFU's forwarding, or a keyframe/burst problem
 * upstream. That distinction requires seeing every subscriber of a track at once, which is why this
 * belongs server-side.
 *
 * Symptoms are accumulated in a sliding window rather than judged per tick, because a burst is
 * spread over a few samples.
 */
export class PliAndFreezeFanOutDetector implements Detector {
	public readonly name = 'pli-and-freeze-fan-out-detector';

	private readonly _config: PliAndFreezeFanOutDetectorConfig;
	private readonly _aggregator: TrackDistributionAggregator;
	private readonly _windows = new Map<string, TrackWindow>();

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<PliAndFreezeFanOutDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._aggregator = new TrackDistributionAggregator(
			_call,
			{ ...defaultReceiverHealthThresholds, ...config.thresholds },
		);
	}

	public update(): void {
		const now = Date.now();
		const distributions = this._aggregator.aggregate();
		const seen = new Set<string>();

		for (const distribution of distributions) {
			seen.add(distribution.trackId);

			const window = this._windowOf(distribution.trackId);
			const pliReceivers = distribution.receivers.filter((r) => 0 < r.deltaPliCount);
			const freezeReceivers = distribution.receivers.filter((r) => 0 < r.deltaFreezeCount);

			if (0 < pliReceivers.length) {
				window.pli.add({ receivers: pliReceivers.map((r) => r.clientId), count: distribution.plis.total }, now);
			}
			if (0 < freezeReceivers.length) {
				window.freeze.add({ receivers: freezeReceivers.map((r) => r.clientId), count: distribution.freezes.total }, now);
			}

			if (distribution.numberOfReceivers < this._config.minReceivers) continue;

			this._evaluate(distribution, window, now, 'pli');
			this._evaluate(distribution, window, now, 'freeze');
		}

		// drop state for tracks that no longer distribute
		for (const trackId of [ ...this._windows.keys() ]) {
			if (!seen.has(trackId)) this._windows.delete(trackId);
		}
	}

	public close(): void {
		this._windows.clear();
	}

	private _evaluate(distribution: ObservedTrackDistribution, window: TrackWindow, now: number, kind: 'pli' | 'freeze') {
		const samples = (kind === 'pli' ? window.pli : window.freeze).values(now);

		if (samples.length === 0) return;

		const affected = new Set<string>();
		let total = 0;

		for (const sample of samples) {
			for (const clientId of sample.receivers) affected.add(clientId);
			total += sample.count;
		}

		const affectedRatio = affected.size / distribution.numberOfReceivers;

		if (affectedRatio < this._config.affectedRatioThreshold) return;
		if (kind === 'pli' && total < this._config.minPliCount) return;

		const type = kind === 'pli'
			? PliAndFreezeFanOutTypes.publisherPliStorm
			: PliAndFreezeFanOutTypes.publishedVideoFrozenForMultipleReceivers;

		const lastRaisedAt = window.lastRaisedAt.get(type) ?? 0;

		if (now - lastRaisedAt < this._config.cooldownMs) return;

		window.lastRaisedAt.set(type, now);

		this._call.addIssue({
			type,
			timestamp: now,
			payload: JSON.stringify({
				type,
				trackId: distribution.trackId,
				kind: distribution.kind,
				publisherClientId: distribution.publisher.clientId,
				publisherHealthy: distribution.publisher.healthy,
				publisherReasons: distribution.publisher.reasons,
				receivers: distribution.numberOfReceivers,
				affectedReceivers: affected.size,
				affectedRatio,
				affectedClientIds: [ ...affected ],
				total,
				windowMs: this._config.windowMs,
			}),
		});
	}

	private _windowOf(trackId: string): TrackWindow {
		let window = this._windows.get(trackId);

		if (!window) {
			window = {
				pli: new SlidingWindow(this._config.windowMs),
				freeze: new SlidingWindow(this._config.windowMs),
				lastRaisedAt: new Map(),
			};
			this._windows.set(trackId, window);
		}

		return window;
	}
}
