import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import {
	defaultReceiverHealthThresholds,
	ObservedTrackDistribution,
	ReceiverHealthThresholds,
	TrackDistributionAggregator,
} from '../utils/TrackDistributionAggregator';

/** The finding types this detector raises (as `call-issue.type`). */
export const CommonSourceDegradationTypes = {
	/** The publisher's egress looks fine, yet most subscribers are degraded → downstream/SFU suspected. */
	publisherHealthySubscribersDegraded: 'PUBLISHER_HEALTHY_SUBSCRIBERS_DEGRADED',

	/** The publisher itself is impaired and every subscriber sees it → source-side problem. */
	publisherDegradedForAllSubscribers: 'PUBLISHER_DEGRADED_FOR_ALL_SUBSCRIBERS',

	/** Exactly one subscriber is degraded while the rest are fine → that receiver's own problem. */
	singleSubscriberDegraded: 'SINGLE_SUBSCRIBER_DEGRADED',

	/** Several (but not most) subscribers degraded on the same source. */
	multipleSubscribersDegraded: 'MULTIPLE_SUBSCRIBERS_DEGRADED',
} as const;

export type CommonSourceDegradationDetectorConfig = {

	/** Minimum subscribers before a ratio is meaningful. Default `3`. */
	minReceivers: number;

	/** degradedRatio at/above which the problem is treated as common to the source. Default `0.6`. */
	degradedRatioThreshold: number;

	/** Per-receiver health thresholds (forwarded to the aggregator). */
	thresholds?: Partial<ReceiverHealthThresholds>;

	/**
	 * Consecutive ticks a condition must hold before an issue is raised, to avoid flapping on a
	 * single bad sample. Default `2`.
	 */
	consecutiveTicks: number;
};

const defaultConfig: CommonSourceDegradationDetectorConfig = {
	minReceivers: 3,
	degradedRatioThreshold: 0.6,
	consecutiveTicks: 2,
};

/**
 * Compares a published track against **all** of its subscribers and decides where the fault lies.
 *
 * This is the detector that only a server-side observer can run: a single browser cannot know
 * whether the other participants receiving the same source see the same thing. Requires a
 * `RemoteTrackResolver` (`ObserverConfig.createTrackResolver`) — without publisher↔subscriber links
 * there is nothing to compare and the detector stays silent.
 */
export class CommonSourceDegradationDetector implements Detector {
	public readonly name = 'common-source-degradation-detector';

	private readonly _config: CommonSourceDegradationDetectorConfig;
	private readonly _aggregator: TrackDistributionAggregator;

	/** trackId -> consecutive ticks the same finding held. */
	private readonly _streaks = new Map<string, { type: string, ticks: number }>();

	/** The distributions computed on the most recent `update()` (handy for dashboards). */
	public lastDistributions: ObservedTrackDistribution[] = [];

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<CommonSourceDegradationDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._aggregator = new TrackDistributionAggregator(
			_call,
			{ ...defaultReceiverHealthThresholds, ...config.thresholds },
		);
	}

	public update(): void {
		this.lastDistributions = this._aggregator.aggregate();

		const seen = new Set<string>();

		for (const distribution of this.lastDistributions) {
			seen.add(distribution.trackId);

			const type = this._classify(distribution);

			if (!type) {
				this._streaks.delete(distribution.trackId);
				continue;
			}

			const streak = this._streaks.get(distribution.trackId);
			const ticks = streak?.type === type ? streak.ticks + 1 : 1;

			this._streaks.set(distribution.trackId, { type, ticks });

			// Raise once, when the streak first reaches the threshold.
			if (ticks === this._config.consecutiveTicks) {
				this._call.addIssue({
					type,
					timestamp: Date.now(),
					payload: JSON.stringify(this._payload(distribution, type)),
				});
			}
		}

		// forget tracks that no longer distribute
		for (const trackId of [ ...this._streaks.keys() ]) {
			if (!seen.has(trackId)) this._streaks.delete(trackId);
		}
	}

	private _classify(distribution: ObservedTrackDistribution): string | undefined {
		const { numberOfReceivers, numberOfDegradedReceivers, degradedRatio, publisher } = distribution;

		if (numberOfDegradedReceivers === 0) return undefined;

		// A single degraded receiver among healthy ones is that receiver's own problem — report it
		// regardless of `minReceivers`, as long as there is something to compare against.
		if (numberOfDegradedReceivers === 1 && 1 < numberOfReceivers) {
			return CommonSourceDegradationTypes.singleSubscriberDegraded;
		}

		if (numberOfReceivers < this._config.minReceivers) return undefined;

		if (this._config.degradedRatioThreshold <= degradedRatio) {
			return publisher.healthy
				? CommonSourceDegradationTypes.publisherHealthySubscribersDegraded
				: CommonSourceDegradationTypes.publisherDegradedForAllSubscribers;
		}

		return CommonSourceDegradationTypes.multipleSubscribersDegraded;
	}

	private _payload(distribution: ObservedTrackDistribution, type: string) {
		return {
			type,
			trackId: distribution.trackId,
			kind: distribution.kind,
			publisher: {
				clientId: distribution.publisher.clientId,
				healthy: distribution.publisher.healthy,
				reasons: distribution.publisher.reasons,
				bitrate: distribution.publisher.bitrate,
				remoteFractionLost: distribution.publisher.remoteFractionLost,
				qualityLimitationReason: distribution.publisher.qualityLimitationReason,
			},
			receivers: distribution.numberOfReceivers,
			degradedReceivers: distribution.numberOfDegradedReceivers,
			degradedRatio: distribution.degradedRatio,
			affectedClientIds: distribution.receivers.filter((r) => r.degraded).map((r) => r.clientId),
			freezes: distribution.freezes,
			plis: distribution.plis,
			fractionLost: distribution.fractionLost,
			bitrate: distribution.bitrate,
		};
	}
}
