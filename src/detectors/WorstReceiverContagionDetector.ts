import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import { TrackDistributionAggregator } from '../utils/TrackDistributionAggregator';
import { SlidingWindow, percentile } from '../utils/stats';

export const WorstReceiverContagionTypes = {
	/**
	 * A publisher's sending bitrate is tracking its **worst** receiver — one bad downlink is
	 * dragging the quality everyone else gets.
	 */
	worstReceiverContagion: 'WORST_RECEIVER_CONTAGION',
} as const;

export type WorstReceiverContagionDetectorConfig = {

	/** Minimum receivers before the comparison means anything. Default `3`. */
	minReceivers: number;

	/** Observation window (ms) the correlation is computed over. Default `30_000`. */
	windowMs: number;

	/** Minimum samples inside the window before judging. Default `4`. */
	minSamples: number;

	/**
	 * How closely the publisher's bitrate must track the worst receiver's, relative to the spread
	 * between the worst and the median receiver. Default `0.75`.
	 */
	trackingRatioThreshold: number;

	/**
	 * The worst receiver must be this much worse than the median receiver before the situation even
	 * counts as "one bad apple" (0..1 of the median). Default `0.5` — i.e. at most half.
	 */
	outlierRatioThreshold: number;

	/** Re-arm time (ms) per track. Default `120_000`. */
	cooldownMs: number;
};

const defaultConfig: WorstReceiverContagionDetectorConfig = {
	minReceivers: 3,
	windowMs: 30_000,
	minSamples: 4,
	trackingRatioThreshold: 0.75,
	outlierRatioThreshold: 0.5,
	cooldownMs: 120_000,
};

type TrackSample = {
	publisherBitrate: number;
	worstReceiverBitrate: number;
	medianReceiverBitrate: number;
};

/**
 * Detects the classic SFU misconfiguration: **the sender adapting to the worst receiver**.
 *
 * In a correctly built SFU the RTCP feedback loop is *terminated* at the server — each receiver's
 * reports drive what that receiver is sent, and the publisher encodes for the server, not for the
 * unluckiest participant. When the loop is instead relayed end to end, the publisher's bandwidth
 * estimate collapses to the minimum across all receivers, so a single participant on a bad 3G link
 * silently downgrades the stream *everyone* sees. Simulcast exists precisely to prevent this
 * "lowest common denominator" outcome, and its absence (or an SFU that forwards RR/REMB verbatim)
 * reproduces it.
 *
 * The signature is a correlation, not a threshold, so it is judged over a window: the publisher's
 * outbound bitrate moving in lockstep with the *worst* receiver's inbound bitrate, while the median
 * receiver has ample headroom. A publisher that drops because of its own uplink or CPU shows no such
 * relationship — every receiver falls together and there is no outlier to track.
 *
 * This is arguably the most valuable thing an observer can detect, because the damage is invisible
 * from every individual endpoint: the publisher sees "my bitrate went down", each healthy receiver
 * sees "my video got worse", and nobody can see the causal link except the server.
 */
export class WorstReceiverContagionDetector implements Detector {
	public readonly name = 'worst-receiver-contagion-detector';

	private readonly _config: WorstReceiverContagionDetectorConfig;
	private readonly _aggregator: TrackDistributionAggregator;
	private readonly _windows = new Map<string, SlidingWindow<TrackSample>>();
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<WorstReceiverContagionDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._aggregator = new TrackDistributionAggregator(_call);
	}

	public update(): void {
		const now = Date.now();
		const seen = new Set<string>();

		for (const distribution of this._aggregator.aggregate()) {
			seen.add(distribution.trackId);

			if (distribution.numberOfReceivers < this._config.minReceivers) continue;
			if (distribution.publisher.bitrate <= 0) continue;

			const receiverBitrates = distribution.receivers.map((r) => r.bitrate).filter((b) => 0 < b);

			if (receiverBitrates.length < this._config.minReceivers) continue;

			const worst = Math.min(...receiverBitrates);
			const median = percentile(receiverBitrates, 0.5) ?? worst;
			const window = this._windowOf(distribution.trackId);

			window.add({ publisherBitrate: distribution.publisher.bitrate, worstReceiverBitrate: worst, medianReceiverBitrate: median }, now);

			const samples = window.values(now);

			if (samples.length < this._config.minSamples) continue;

			// Is there actually an outlier to be dragged down by?
			const latest = samples[samples.length - 1];
			const outlierRatio = 0 < latest.medianReceiverBitrate
				? latest.worstReceiverBitrate / latest.medianReceiverBitrate
				: 1;

			if (this._config.outlierRatioThreshold < outlierRatio) continue;

			const tracking = correlation(
				samples.map((s) => s.publisherBitrate),
				samples.map((s) => s.worstReceiverBitrate),
			);
			const medianTracking = correlation(
				samples.map((s) => s.publisherBitrate),
				samples.map((s) => s.medianReceiverBitrate),
			);

			// The publisher must follow the WORST receiver specifically — if it tracks the median
			// just as closely, everyone is simply moving together and nothing is being dragged.
			if (tracking < this._config.trackingRatioThreshold) continue;
			if (tracking <= medianTracking) continue;
			if (now - (this._lastRaisedAt.get(distribution.trackId) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(distribution.trackId, now);

			const worstReceiver = distribution.receivers.reduce((a, b) => (a.bitrate <= b.bitrate ? a : b));

			this._call.addIssue({
				type: WorstReceiverContagionTypes.worstReceiverContagion,
				timestamp: now,
				payload: JSON.stringify({
					type: WorstReceiverContagionTypes.worstReceiverContagion,
					trackId: distribution.trackId,
					kind: distribution.kind,
					publisherClientId: distribution.publisher.clientId,
					publisherBitrate: distribution.publisher.bitrate,
					worstReceiverClientId: worstReceiver.clientId,
					worstReceiverBitrate: latest.worstReceiverBitrate,
					medianReceiverBitrate: latest.medianReceiverBitrate,
					outlierRatio,
					trackingWithWorst: tracking,
					trackingWithMedian: medianTracking,
					receivers: distribution.numberOfReceivers,
					windowMs: this._config.windowMs,
					samples: samples.length,
				}),
			});
		}

		for (const trackId of [ ...this._windows.keys() ]) {
			if (!seen.has(trackId)) this._windows.delete(trackId);
		}
	}

	public close(): void {
		this._windows.clear();
		this._lastRaisedAt.clear();
	}

	private _windowOf(trackId: string): SlidingWindow<TrackSample> {
		let window = this._windows.get(trackId);

		if (!window) {
			window = new SlidingWindow<TrackSample>(this._config.windowMs);
			this._windows.set(trackId, window);
		}

		return window;
	}
}

/** Pearson correlation, clamped to 0..1 (negative or undefined relationships read as 0). */
function correlation(xs: number[], ys: number[]): number {
	const n = Math.min(xs.length, ys.length);

	if (n < 2) return 0;

	const meanX = xs.reduce((s, v) => s + v, 0) / n;
	const meanY = ys.reduce((s, v) => s + v, 0) / n;
	let covariance = 0;
	let varianceX = 0;
	let varianceY = 0;

	for (let i = 0; i < n; i++) {
		const dx = xs[i] - meanX;
		const dy = ys[i] - meanY;

		covariance += dx * dy;
		varianceX += dx * dx;
		varianceY += dy * dy;
	}

	if (varianceX <= 0 || varianceY <= 0) return 0;

	return Math.max(0, covariance / Math.sqrt(varianceX * varianceY));
}
