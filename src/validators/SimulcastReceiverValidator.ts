import type { Observer } from '../Observer';
import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import type { Validator, ValidationReport } from './Validator';
import { SlidingWindow } from '../utils/SlidingWindow';
import { percentile, correlation } from '../utils/stats';

/** Raised once if one receiver turns out to be dragging a publisher down for everyone. */
export const LOWEST_COMMON_DENOMINATOR_ISSUE = 'WORST_RECEIVER_CONTAGION';

/** The measurements behind a decided verdict — everything needed to check the call yourself. */
export type SimulcastReceiverEvidence = {
	callId: string;
	trackId: string;
	publisherClientId: string;
	worstReceiverClientId: string;
	publisherBitrate: number;
	worstReceiverBitrate: number;
	medianReceiverBitrate: number;

	/** How closely the publisher's bitrate followed the **worst** receiver's, `0..1`. */
	trackingWithWorst: number;

	/** The same against the **median** receiver — the control. */
	trackingWithMedian: number;
};

export type SimulcastReceiverReportPayload = ({

	/** The publisher held up while one receiver lagged: layers are being chosen per consumer. */
	verdict: 'layer-decided-per-receiver';
	evidence: SimulcastReceiverEvidence;
} | {

	/** The publisher tracked its worst receiver: everyone is getting the lowest common denominator. */
	verdict: 'layer-decided-lowest-common-denominator';
	evidence: SimulcastReceiverEvidence;
} | {

	/** Gave up without the conditions needed to judge. **Not a pass.** */
	verdict: 'inconclusive';
	reason: string;
}) & {
	startedAt: number;

	/** How many times the check actually ran — i.e. how much the verdict is worth. */
	checks: number;
};

export type SimulcastReceiverValidatorConfig = {

	/** Minimum receivers of a published track before the comparison means anything. */
	minReceivers: number;

	/** How long a track's bitrates are correlated over (ms). */
	windowMs: number;

	/** Samples needed inside the window before it can be judged. */
	minSamples: number;

	/** The worst receiver must be at most this share of the median, or there is nothing to be dragged by. */
	outlierRatioThreshold: number;

	/** How closely the publisher must follow the worst receiver to count as dragged. */
	trackingRatioThreshold: number;

	/** Clean checks required before concluding per-receiver adaptation. One could be luck. */
	minChecks: number;
};

type Bitrates = { publisher: number, worst: number, median: number };

/**
 * Answers one question: **does this SFU adapt each receiver on its own, or does one bad receiver
 * drag the publisher down for everyone?**
 *
 * That is what simulcast (or SVC) exists to prevent. With several encodings available the server can
 * hand the struggling participant a lower layer and leave everyone else alone. Without it — or with
 * a server that relays RTCP end to end instead of terminating it, so the publisher's bandwidth
 * estimate collapses to the minimum across all receivers — the only way to serve the slowest
 * participant is to make the source send less, and everybody gets the lowest common denominator.
 *
 * The two causes are worth naming because the *observation* cannot separate them: the publisher's
 * bitrate tracking its worst receiver looks identical either way. What the check establishes is
 * whether per-receiver adaptation is happening at all. If the verdict is
 * `layer-decided-lowest-common-denominator`, look at both — is simulcast/SVC actually enabled with
 * layers selected per consumer, and is the SFU terminating receiver reports rather than forwarding
 * them?
 *
 * ### The control matters more than the correlation
 *
 * "Publisher follows worst receiver" alone proves nothing: when the whole call degrades together,
 * the publisher follows *everyone*, and that is ordinary adaptation working correctly. The verdict
 * only goes against the deployment when the publisher tracks the worst receiver **more closely than
 * it tracks the median** — the worst receiver is leading, not merely coinciding.
 *
 * Likewise, a window with no outlier in it is not evidence of health, it is an untested SFU: if
 * nobody is struggling, there is nothing for per-receiver adaptation to do. Those windows are
 * skipped and never counted in `checks`.
 *
 * ### Why a validator, not a detector
 *
 * This is a property of the SFU build and configuration, not of this moment: a server doing
 * per-receiver layer selection at 09:00 still is at 17:00. Re-deriving it every tick cannot produce
 * new information — it would only keep a sliding window alive per published track for the life of
 * every call. So it decides once, reports, and releases that state.
 *
 * ```ts
 * observer.on('validation-ready', ({ validator, report }) => {
 *   if (validator !== 'simulcast-receivers' || !report.ready) return;
 *   console.log(report.verdict);   // 'layer-decided-per-receiver' | ... | 'inconclusive'
 * });
 *
 * observer.addValidator('simulcast-receivers');
 * onDeploy(() => observer.addValidator('simulcast-receivers'));   // check again
 * ```
 *
 * ### `inconclusive` is not a pass
 *
 * The check only runs when a publisher has several receivers and one of them is far behind the
 * median; plenty of healthy deployments never present that. Concluding from the absence of a failure
 * would verify nothing, so `checks` counts the times the check genuinely ran, and a validator that
 * is cancelled (or whose observer closes) finishes `inconclusive` with the reason why.
 */
export class SimulcastReceiverValidator implements Validator<SimulcastReceiverReportPayload> {
	public static readonly NAME = 'simulcast-receivers' as const;

	public readonly name = SimulcastReceiverValidator.NAME;

	public readonly startedAt = Date.now();

	public report: ValidationReport<SimulcastReceiverReportPayload> = { ready: false };

	private readonly _config: SimulcastReceiverValidatorConfig;
	private readonly _windows = new Map<string, SlidingWindow<Bitrates>>();
	private _checks = 0;
	private _done = false;

	public constructor(
		private readonly _observer: Observer,
		public readonly onDone: (report: ValidationReport<SimulcastReceiverReportPayload>) => void,
		config: Partial<SimulcastReceiverValidatorConfig> = {},
	) {
		this._config = {
			minChecks: 3,
			minReceivers: 3,
			windowMs: 10_000,
			minSamples: 5,
			outlierRatioThreshold: 0.5,
			trackingRatioThreshold: 0.8,
			...config,
		};
	}

	/** How many times the comparison actually ran. `0` means nothing was established. */
	public get checks(): number {
		return this._checks;
	}

	/** Give up without a verdict, freeing anything waiting on this validator. */
	public cancel(reason = 'cancelled'): void {
		this._finish({ verdict: 'inconclusive', reason });
	}

	public update(): void {
		if (this._done) return;

		const now = Date.now();
		const live = new Set<string>();

		for (const call of this._observer.observedCalls.values()) {
			// Without publisher<->subscriber links there is no "the receivers of this track" to compare.
			if (!call.remoteTrackResolver) continue;

			for (const client of call.observedClients.values()) {
				for (const peerConnection of client.observedPeerConnections.values()) {
					for (const publisher of peerConnection.observedOutboundTracks.values()) {
						// Simulcast/SVC is a video mechanism; an audio track has no layers to select.
						if (publisher.kind !== 'video') continue;

						live.add(publisher.id);

						if (this._inspect(call.callId, client.clientId, publisher, now)) return;
					}
				}
			}
		}

		// Forget windows for tracks that are gone, or a long-lived observer retains one per track
		// ever published.
		for (const trackId of [ ...this._windows.keys() ]) {
			if (!live.has(trackId)) this._windows.delete(trackId);
		}
	}

	/** Returns `true` when a verdict was reached and the caller should stop iterating. */
	private _inspect(callId: string, publisherClientId: string, publisher: ObservedOutboundTrack, now: number): boolean {
		const publisherBitrate = publisher.bitrate;

		if (publisherBitrate === undefined || publisherBitrate <= 0) return false;
		if (publisher.remoteInboundTracks.size < this._config.minReceivers) return false;

		const receivers: { clientId: string, bitrate: number }[] = [];

		for (const receiver of publisher.remoteInboundTracks) {
			const bitrate = receiver.getInboundRtp()?.bitrate;

			// A receiver with no bitrate this tick is a missing measurement, not a bitrate of zero —
			// counting it as 0 would manufacture the very outlier this check looks for.
			if (bitrate === undefined || bitrate <= 0) continue;

			receivers.push({ clientId: receiver.getPeerConnection().client.clientId, bitrate });
		}

		if (receivers.length < this._config.minReceivers) return false;

		const bitrates = receivers.map((receiver) => receiver.bitrate);
		const worstReceiver = receivers.reduce((a, b) => (a.bitrate <= b.bitrate ? a : b));
		const worst = worstReceiver.bitrate;
		const median = percentile(bitrates, 0.5) ?? worst;
		const window = this._windowOf(publisher.id);

		window.add({ publisher: publisherBitrate, worst, median }, now);

		const samples = window.values(now);

		if (samples.length < this._config.minSamples) return false;

		const latest = samples[samples.length - 1];
		const outlierRatio = 0 < latest.median ? latest.worst / latest.median : 1;

		// No outlier means the SFU is not being tested — this window teaches us nothing, and counting
		// it would let "nothing ever went wrong" masquerade as "it handles things correctly".
		if (this._config.outlierRatioThreshold < outlierRatio) return false;

		++this._checks;
		window.clear();

		const trackingWithWorst = correlation(samples.map((s) => s.publisher), samples.map((s) => s.worst));
		const trackingWithMedian = correlation(samples.map((s) => s.publisher), samples.map((s) => s.median));
		// The publisher must follow the WORST receiver specifically. Following the median just as
		// closely means everyone moved together, which is ordinary adaptation.
		const dragged = this._config.trackingRatioThreshold <= trackingWithWorst
			&& trackingWithMedian < trackingWithWorst;

		const evidence: SimulcastReceiverEvidence = {
			callId,
			trackId: publisher.id,
			publisherClientId,
			worstReceiverClientId: worstReceiver.clientId,
			publisherBitrate,
			worstReceiverBitrate: latest.worst,
			medianReceiverBitrate: latest.median,
			trackingWithWorst,
			trackingWithMedian,
		};

		if (dragged) {
			this._finish({ verdict: 'layer-decided-lowest-common-denominator', evidence });

			return true;
		}

		if (this._config.minChecks <= this._checks) {
			this._finish({ verdict: 'layer-decided-per-receiver', evidence });

			return true;
		}

		return false;
	}

	/**
	 * Settle on a verdict, exactly once.
	 *
	 * The guard is not paranoia: `onDone` removes this validator from the observer, and a second call
	 * would emit a second `validation-ready` for a validator that is no longer registered — e.g. when
	 * `observer.close()` cancels a validator that decided earlier in the same tick.
	 */
	private _finish(outcome:
	| { verdict: 'layer-decided-per-receiver', evidence: SimulcastReceiverEvidence }
	| { verdict: 'layer-decided-lowest-common-denominator', evidence: SimulcastReceiverEvidence }
	| { verdict: 'inconclusive', reason: string },
	): void {
		if (this._done) return;
		this._done = true;

		const decidedAt = Date.now();

		this._windows.clear();
		this.report = {
			ready: true,
			decidedAt,
			startedAt: this.startedAt,
			checks: this._checks,
			...outcome,
		};

		if (outcome.verdict === 'layer-decided-lowest-common-denominator') {
			this._observer.addIssue({
				type: LOWEST_COMMON_DENOMINATOR_ISSUE,
				timestamp: decidedAt,
				conclusion: {
					faultDomain: 'infrastructure',
					summary: 'one bad receiver is dragging a publisher\'s bitrate down for everyone — the SFU is not selecting layers per consumer',
					recommendation: 'check that simulcast/SVC is enabled and layers are chosen per consumer, and that the SFU terminates receiver reports instead of forwarding them; this is a build/config property, not a transient',
					confidence: 0.8,
				},
				payload: { checks: this._checks, ...outcome.evidence },
			});
		}

		this.onDone(this.report);
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
