import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import {
	defaultReceiverHealthThresholds,
	ReceiverHealthThresholds,
	TrackDistributionAggregator,
} from '../utils/TrackDistributionAggregator';
import { percentile } from '../utils/stats';

export const AudioImpairmentFanOutTypes = {
	/** Most receivers of one microphone are concealing audio → the problem follows that source. */
	publishedAudioDegradedForMajority: 'PUBLISHED_AUDIO_DEGRADED_FOR_MAJORITY',

	/** Receivers across the call are under jitter-buffer pressure → shared delivery problem. */
	callWideAudioJitterBufferStress: 'CALL_WIDE_AUDIO_JITTER_BUFFER_STRESS',
} as const;

export type AudioImpairmentFanOutDetectorConfig = {

	/** Minimum receivers of a track before a ratio is meaningful. Default `3`. */
	minReceivers: number;

	/** Fraction of receivers that must be impaired. Default `0.6`. */
	affectedRatioThreshold: number;

	/** Jitter-buffer delay (ms) above which a receiver counts as stressed. Default `500`. */
	jitterBufferDelayInMs: number;

	/** Minimum audio receivers in the call before the call-wide check runs. Default `5`. */
	minCallReceivers: number;

	/** Consecutive ticks the condition must hold before raising. Default `2`. */
	consecutiveTicks: number;

	thresholds?: Partial<ReceiverHealthThresholds>;
};

const defaultConfig: AudioImpairmentFanOutDetectorConfig = {
	minReceivers: 3,
	affectedRatioThreshold: 0.6,
	jitterBufferDelayInMs: 500,
	minCallReceivers: 5,
	consecutiveTicks: 2,
};

/**
 * Audio-side fan-out analysis, using the concealment / jitter-buffer metrics WebRTC exposes on the
 * receiver (NetEQ's own account of how hard it is working to keep audio smooth).
 *
 * Two questions a browser can't answer:
 *
 * 1. *Does the impairment follow the source?* If every receiver of Alice's microphone is concealing
 *    ~20% of samples while every receiver of Bob's is at ~0.1%, the fault is on Alice's path, not on
 *    the receivers.
 * 2. *Is the whole call's audio delivery under pressure?* One receiver with a huge jitter buffer is
 *    their own network; fifteen of twenty at once is shared.
 */
export class AudioImpairmentFanOutDetector implements Detector {
	public readonly name = 'audio-impairment-fan-out-detector';

	private readonly _config: AudioImpairmentFanOutDetectorConfig;
	private readonly _aggregator: TrackDistributionAggregator;
	private readonly _trackStreaks = new Map<string, number>();
	private _callStreak = 0;

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<AudioImpairmentFanOutDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._aggregator = new TrackDistributionAggregator(
			_call,
			{ ...defaultReceiverHealthThresholds, ...config.thresholds },
		);
	}

	public update(): void {
		const now = Date.now();
		const distributions = this._aggregator.aggregate().filter((d) => d.kind === 'audio');
		const seen = new Set<string>();
		const callJitterBufferDelays: number[] = [];
		let stressedReceivers = 0;
		let totalReceivers = 0;

		for (const distribution of distributions) {
			seen.add(distribution.trackId);

			for (const receiver of distribution.receivers) {
				totalReceivers += 1;
				if (receiver.jitterBufferDelayInMs !== undefined) {
					callJitterBufferDelays.push(receiver.jitterBufferDelayInMs);
					if (this._config.jitterBufferDelayInMs < receiver.jitterBufferDelayInMs) stressedReceivers += 1;
				}
			}

			if (distribution.numberOfReceivers < this._config.minReceivers) {
				this._trackStreaks.delete(distribution.trackId);
				continue;
			}

			const affectedRatio = distribution.concealment.affectedReceivers / distribution.numberOfReceivers;

			if (affectedRatio < this._config.affectedRatioThreshold) {
				this._trackStreaks.delete(distribution.trackId);
				continue;
			}

			const ticks = (this._trackStreaks.get(distribution.trackId) ?? 0) + 1;

			this._trackStreaks.set(distribution.trackId, ticks);

			if (ticks === this._config.consecutiveTicks) {
				this._call.addIssue({
					type: AudioImpairmentFanOutTypes.publishedAudioDegradedForMajority,
					timestamp: now,
					payload: JSON.stringify({
						type: AudioImpairmentFanOutTypes.publishedAudioDegradedForMajority,
						trackId: distribution.trackId,
						publisherClientId: distribution.publisher.clientId,
						publisherHealthy: distribution.publisher.healthy,
						receivers: distribution.numberOfReceivers,
						affectedReceivers: distribution.concealment.affectedReceivers,
						affectedRatio,
						concealmentRatio: distribution.concealmentRatio,
						jitterBufferDelayInMs: distribution.jitterBufferDelayInMs,
						affectedClientIds: distribution.receivers
							.filter((r) => this._aggregator.thresholds.concealmentRatio <= (r.concealmentRatio ?? 0))
							.map((r) => r.clientId),
					}),
				});
			}
		}

		for (const trackId of [ ...this._trackStreaks.keys() ]) {
			if (!seen.has(trackId)) this._trackStreaks.delete(trackId);
		}

		this._evaluateCallWide(now, totalReceivers, stressedReceivers, callJitterBufferDelays);
	}

	public close(): void {
		this._trackStreaks.clear();
		this._callStreak = 0;
	}

	private _evaluateCallWide(now: number, totalReceivers: number, stressedReceivers: number, delays: number[]) {
		if (totalReceivers < this._config.minCallReceivers) {
			this._callStreak = 0;

			return;
		}

		const stressedRatio = stressedReceivers / totalReceivers;

		if (stressedRatio < this._config.affectedRatioThreshold) {
			this._callStreak = 0;

			return;
		}

		this._callStreak += 1;

		if (this._callStreak !== this._config.consecutiveTicks) return;

		this._call.addIssue({
			type: AudioImpairmentFanOutTypes.callWideAudioJitterBufferStress,
			timestamp: now,
			payload: JSON.stringify({
				type: AudioImpairmentFanOutTypes.callWideAudioJitterBufferStress,
				callId: this._call.callId,
				audioReceivers: totalReceivers,
				stressedReceivers,
				stressedRatio,
				jitterBufferDelayInMs: {
					median: percentile(delays, 0.5),
					p95: percentile(delays, 0.95),
				},
			}),
		});
	}
}
