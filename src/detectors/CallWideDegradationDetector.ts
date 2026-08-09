import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import {
	CallHealth,
	CallHealthAggregator,
	ClientHealthThresholds,
	defaultClientHealthThresholds,
} from '../utils/CallHealthAggregator';

export const CallWideDegradationTypes = {
	/** Most participants degraded at once → shared cause (call/SFU/network), not individual endpoints. */
	callWideQualityDegradation: 'CALL_WIDE_QUALITY_DEGRADATION',

	/** Most participants' **receiving** side degraded → downstream/egress suspected. */
	callWideInboundDegradation: 'CALL_WIDE_INBOUND_DEGRADATION',

	/** Most participants' **sending** side degraded → ingress suspected. */
	callWideOutboundDegradation: 'CALL_WIDE_OUTBOUND_DEGRADATION',
} as const;

export type CallWideDegradationDetectorConfig = {

	/** Minimum participants before a ratio means anything. Default `3`. */
	minClients: number;

	/** Affected-client ratio at/above which the call is considered call-wide degraded. Default `0.5`. */
	degradedRatioThreshold: number;

	/** Per-client health thresholds. */
	thresholds?: Partial<ClientHealthThresholds>;

	/** Consecutive ticks the condition must hold before raising. Default `2`. */
	consecutiveTicks: number;
};

const defaultConfig: CallWideDegradationDetectorConfig = {
	minClients: 3,
	degradedRatioThreshold: 0.5,
	consecutiveTicks: 2,
};

/**
 * Raises a call-level finding when a **majority of participants** are degraded in the same window —
 * the signal that something shared is wrong rather than one person's Wi-Fi.
 *
 * It also splits by direction, because that is what makes the finding actionable: if most clients'
 * receiving side is bad the suspicion is egress/downstream; if most clients' sending side is bad it
 * points at ingress. Reported with medians/percentiles, never means, so a single 1500 ms outlier
 * can't manufacture (or mask) a call-wide alert.
 */
export class CallWideDegradationDetector implements Detector {
	public readonly name = 'call-wide-degradation-detector';

	private readonly _config: CallWideDegradationDetectorConfig;
	private readonly _aggregator: CallHealthAggregator;
	private _streak?: { type: string, ticks: number };

	/** The health rollup computed on the most recent `update()`. */
	public lastHealth?: CallHealth;

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<CallWideDegradationDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._aggregator = new CallHealthAggregator(
			_call,
			{ ...defaultClientHealthThresholds, ...config.thresholds },
		);
	}

	public update(): void {
		const health = this._aggregator.aggregate();

		this.lastHealth = health;

		const type = this._classify(health);

		if (!type) {
			this._streak = undefined;

			return;
		}

		const ticks = this._streak?.type === type ? this._streak.ticks + 1 : 1;

		this._streak = { type, ticks };

		if (ticks === this._config.consecutiveTicks) {
			this._call.addIssue({
				type,
				timestamp: Date.now(),
				payload: JSON.stringify(this._payload(health, type)),
			});
		}
	}

	private _classify(health: CallHealth): string | undefined {
		if (health.numberOfClients < this._config.minClients) return undefined;

		const threshold = this._config.degradedRatioThreshold;

		if (health.degradedRatio < threshold) return undefined;

		// Prefer the more specific, directional finding when one side clearly dominates.
		if (threshold <= health.inboundDegradedRatio && health.outboundDegradedRatio < threshold) {
			return CallWideDegradationTypes.callWideInboundDegradation;
		}
		if (threshold <= health.outboundDegradedRatio && health.inboundDegradedRatio < threshold) {
			return CallWideDegradationTypes.callWideOutboundDegradation;
		}

		return CallWideDegradationTypes.callWideQualityDegradation;
	}

	private _payload(health: CallHealth, type: string) {
		return {
			type,
			callId: health.callId,
			clients: health.numberOfClients,
			degradedClients: health.numberOfDegradedClients,
			degradedRatio: health.degradedRatio,
			inboundDegradedRatio: health.inboundDegradedRatio,
			outboundDegradedRatio: health.outboundDegradedRatio,
			affectedClientIds: health.clients.filter((c) => c.degraded).map((c) => c.clientId),
			rttInMs: health.rttInMs,
			inboundFractionLost: health.inboundFractionLost,
			concealmentRatio: health.concealmentRatio,
			freezes: health.freezes,
			qualityLimitation: health.qualityLimitation,
		};
	}
}
