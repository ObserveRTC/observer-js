import type { Observer } from '../Observer';
import type { Validator, ValidationReport } from './Validator';
import { percentile, correlation } from '../utils/stats';
import { SlidingWindow } from "../utils/SlidingWindow";
import { createDeferredPromise, DeferredPromise } from '../common/utils';

/** Raised once if one receiver turns out to be dragging a publisher down for everyone. */
export const LOWEST_COMMON_DENOMINATOR_ISSUE = 'WORST_RECEIVER_CONTAGION';

export type SimulcastReceiverReportPayload = ({
	verdict: 'layer-decided-per-receiver'

	evidenceField: string;
} | {
	verdict: 'layer-decided-lowest-common-denominator'
	evidenceField2: string;
} | {
	verdict: 'layer-unknown'
	evidenceField3: undefined;
} | {
	verdict: 'inconclusive'

	reason: string;
}) & {
	startedAt: number;
}


export type SimulcastReceiverValidatorConfig = {

	/** Minimum receivers of a published track before the comparison means anything. */
	minReceivers: number;

	/** How long a track's bitrates are correlated over (ms). */
	windowMs: number;

	/** Samples needed inside the window before it can be judged. */
	minSamples: number;

	/** The worst receiver must be at most this share of the median, or there is nothing to be dragged by. */
	outlierRatioThreshold: number;

	/** How closely the publisher must follow the worst receiver to count as relayed. */
	trackingRatioThreshold: number;

	/** Clean checks required before concluding `terminated`. One could be luck. */
	minChecks: number;
};

type Bitrates = { publisher: number, worst: number, median: number };

/**
 * Answers one question: **does this SFU adapt each receiver on its own, or does one bad receiver
 * drag the publisher down for everyone?**
 *
 * That is what simulcast (or SVC) exists to prevent. With several encodings available the server can
 * hand the struggling participant a lower layer and leave everyone else alone. Without it — or with a
 * server that relays RTCP end to end instead of terminating it, so the publisher's bandwidth estimate
 * collapses to the minimum across all receivers — the only way to serve the slowest participant is to
 * make the source send less, and everybody gets the lowest common denominator.
 *
 * The two causes are worth naming because the *observation* cannot separate them: the publisher's
 * bitrate tracking its worst receiver looks identical either way. What the check establishes is
 * whether per-receiver adaptation is happening at all. If the verdict is
 * `lowest-common-denominator`, look at both — is simulcast/SVC actually enabled and are layers being
 * selected per consumer, and is the SFU terminating receiver reports rather than forwarding them?
 *
 * ### Why a validator
 *
 * This is a property of the SFU build and configuration, not of this moment: a server doing
 * per-receiver layer selection at 09:00 still is at 17:00. Re-deriving it every tick cannot produce
 * new information — it only keeps a sliding window alive per published track for the life of every
 * call. So it decides once and releases that state.
 *
 * ```ts
 * observer.validators.get('simulcast')?.verdict;
 * // { status: 'per-receiver', ok: true, checks: 3, decidedAt: … }
 *
 * onDeploy(() => observer.validators.invalidateAll());
 * ```
 *
 * ### `unknown` is not a pass
 *
 * The check only runs when a publisher has several receivers and one of them is far behind the
 * median; plenty of healthy deployments never present that. Concluding from the absence of a failure
 * would verify nothing, so `verdict.checks` counts the times the check genuinely ran and the status
 * stays `unknown` until they happen.
 */
export class SimulcastReceiverValidator implements Validator<SimulcastReceiverReportPayload> {
	public readonly name = 'simulcast';

	public readonly startedAt = Date.now();
	public readonly report: ValidationReport<SimulcastReceiverReportPayload> = { ready: false };

	private readonly _windows = new Map<string, SlidingWindow<Bitrates>>();
	private readonly _config: SimulcastReceiverValidatorConfig;
	public constructor(
		private readonly _observer: Observer,
		public readonly onDone: (verdict: ValidationReport<SimulcastReceiverReportPayload>) => void,
		config: Partial<SimulcastReceiverValidatorConfig> = {},
	) {
		this._config = {
			minChecks: 3,
			minReceivers: 3,
			windowMs: 10_000,
			minSamples: 5,
			outlierRatioThreshold: 0.5,
			trackingRatioThreshold: 0.8,
			...config
		};
	}




	/** Forget the verdict and start looking again — call this after an SFU deploy. */
	public cancel(): void {
		this._windows.clear();

		this.onDone({
			ready: true,
			verdict: 'inconclusive',
			decidedAt: Date.now(),
			reason: 'cancelled',
			startedAt: this.startedAt,
		});
	}

	public update(): void {
		const live = new Set<string>();
		const now = Date.now();

		for (const call of this._observer.observedCalls.values()) {
			for (const client of call.observedClients.values()) {
				for (const peerConnection of client.observedPeerConnections.values()) {
					for (const track of peerConnection.observedOutboundTracks.values()) {
						if (track.kind !== 'video') continue;

						live.add(track.id);
					}
				}
			}
			for (const distribution of call.trackDistributionAggregator.aggregate()) {
				if (distribution.numberOfReceivers < this._config.minReceivers) continue;
				if (distribution.publisher.bitrate <= 0) continue;

				const bitrates = distribution.receivers.map((receiver) => receiver.bitrate).filter((bitrate) => 0 < bitrate);

				if (bitrates.length < this._config.minReceivers) continue;

				const worst = Math.min(...bitrates);
				const median = percentile(bitrates, 0.5) ?? worst;
				const window = this._windowOf(distribution.trackId);

				live.add(distribution.trackId);
				window.add({ publisher: distribution.publisher.bitrate, worst, median }, now);

				const samples = window.values(now);

				if (samples.length < this._config.minSamples) continue;

				const latest = samples[samples.length - 1];
				const outlierRatio = 0 < latest.median ? latest.worst / latest.median : 1;

				// No outlier means the SFU is not being tested — this window teaches us nothing.
				if (this._config.outlierRatioThreshold < outlierRatio) continue;

				this.result.checks += 1;
				window.clear();

				const trackingWithWorst = correlation(samples.map((s) => s.publisher), samples.map((s) => s.worst));
				const trackingWithMedian = correlation(samples.map((s) => s.publisher), samples.map((s) => s.median));
				// The publisher must follow the WORST receiver specifically. Following the median too
				// just means everyone moved together, which is ordinary adaptation.
				const dragged = this._config.trackingRatioThreshold <= trackingWithWorst
					&& trackingWithMedian < trackingWithWorst;

				this.result.evidence = {
					callId: call.callId,
					trackId: distribution.trackId,
					publisherClientId: distribution.publisher.clientId,
					worstReceiverClientId: distribution.receivers.reduce((a, b) => (a.bitrate <= b.bitrate ? a : b)).clientId,
					publisherBitrate: distribution.publisher.bitrate,
					worstReceiverBitrate: latest.worst,
					medianReceiverBitrate: latest.median,
					trackingWithWorst,
					trackingWithMedian,
				};

				if (dragged) return this._decide('lowest-common-denominator', now);
				if (this._config.minChecks <= this.result.checks) return this._decide('per-receiver', now);
			}
		}

		for (const trackId of [ ...this._windows.keys() ]) {
			if (!live.has(trackId)) this._windows.delete(trackId);
		}
	}

	private _decide(status: SimulcastStatus, now: number): void {
		this.result.status = status;
		this.result.ok = status === 'per-receiver';
		this.result.decidedAt = now;
		this._windows.clear();
		this._observer.emitValidatorSettled(this.name, this.result);

		if (this.result.ok) return;

		this._observer.addIssue({
			type: LOWEST_COMMON_DENOMINATOR_ISSUE,
			timestamp: now,
			payload: {
				type: LOWEST_COMMON_DENOMINATOR_ISSUE,
				checks: this.result.checks,
				...this.result.evidence,
				conclusion: {
					faultDomain: 'infrastructure',
					summary: 'the SFU relays RTCP instead of terminating it — one bad receiver is dragging a publisher\'s bitrate down for everyone',
					recommendation: 'terminate receiver reports per-consumer and enable simulcast/SVC layer selection; this is a build/config property, not a transient',
					confidence: 0.8,
				},
			},
		});
	}

	private _windowOf(trackId: string): SlidingWindow<Bitrates> {
		let window = this._windows.get(trackId);

		if (!window) {
			window = new SlidingWindow<Bitrates>(this._config.windowMs);
			this._windows.set(trackId, window);
		}

		return window;
	}
}
