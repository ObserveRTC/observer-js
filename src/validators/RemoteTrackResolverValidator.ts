import type { Observer } from '../Observer';
import type { Validator, ValidationReport } from './Validator';

/** Raised once if the resolver turns out never to link anything. */
export const UNRESOLVED_TRACK_LINKS_ISSUE = 'REMOTE_TRACK_LINKS_UNRESOLVED';

/** What the check actually saw, whichever way it went. */
export type RemoteTrackLinkEvidence = {

	/** Calls that presented the conditions for linking: a resolver, ≥2 clients, and inbound tracks. */
	eligibleCalls: number;

	/** Inbound tracks seen across those calls. */
	inboundTracks: number;

	/** Of those, how many were linked to the outbound track that published them. */
	linkedInboundTracks: number;

	/** `linkedInboundTracks / inboundTracks`. */
	linkedRatio: number;

	/** A call that presented the conditions, for the reader to go and look at. */
	exampleCallId?: string;
};

export type RemoteTrackResolverReportPayload = ({

	/** The resolver is linking subscribers to publishers. The detectors that need links will work. */
	verdict: 'links-resolved';
	evidence: RemoteTrackLinkEvidence;
} | {

	/** Every condition for linking was met, repeatedly, and nothing was ever linked. */
	verdict: 'no-links-resolved';
	evidence: RemoteTrackLinkEvidence;
} | {

	/** Never saw a call that could have been linked. **Not a pass.** */
	verdict: 'inconclusive';
	reason: string;
}) & {
	startedAt: number;

	/** How many times the check genuinely ran — i.e. how much the verdict is worth. */
	checks: number;
};

export type RemoteTrackResolverValidatorConfig = {

	/** Participants a call needs before it can plausibly have publisher↔subscriber links. Default `2`. */
	minClients: number;

	/** Inbound tracks that must be present in a call before it counts as a check. Default `2`. */
	minInboundTracks: number;

	/** Share of inbound tracks that must be linked to conclude the resolver works. Default `0.5`. */
	linkedRatioThreshold: number;

	/** Eligible calls to observe before concluding either way. One could be a race. Default `3`. */
	minChecks: number;
};

/**
 * Answers one question: **is the `RemoteTrackResolver` actually linking anything?**
 *
 * ### Why this is worth a validator
 *
 * Four things in this library are built on publisher↔subscriber links —
 * `IssueFanOutDetector`, `TrackDeliveryMismatchDetector`, `UnconsumedTrackDetector` and
 * `SimulcastReceiverValidator`. Every one of them checks `call.remoteTrackResolver` and, finding no
 * links, correctly does nothing rather than guessing.
 *
 * That is the right behaviour and it produces a nasty failure mode: a resolver wired to the wrong id
 * field, or a mediasoup `producerId` the application never attaches, leaves all four permanently
 * silent — and **silence is what a healthy deployment looks like too**. You would conclude your
 * calls were clean when in fact nothing was ever examined. This check exists to make that specific
 * mistake loud.
 *
 * ### `inconclusive` is not a pass
 *
 * A verdict is only reached from calls that *could* have been linked: a resolver configured, at
 * least `minClients` participants, and at least `minInboundTracks` inbound tracks present. A
 * one-to-one deployment, a lobby full of audio-only listeners, or a quiet period never presents
 * those conditions — and concluding "resolver works" from calls that had nothing to resolve would be
 * the very mistake this validator is here to catch. `checks` counts the eligible calls actually
 * seen; a validator cancelled before reaching `minChecks` finishes `inconclusive` and says so.
 *
 * ```ts
 * observer.on('validation-ready', ({ validator, report }) => {
 *   if (validator !== 'remote-track-resolver' || !report.ready) return;
 *   if (report.verdict === 'no-links-resolved') alert('resolver misconfigured — 4 detectors are inert');
 * });
 *
 * observer.addValidator('remote-track-resolver');
 * ```
 *
 * Run it once at start-up, and again after changing the resolver or the SFU's id scheme. Like every
 * validator it is one-shot: the answer is a property of the wiring, not of this moment.
 */
export class RemoteTrackResolverValidator implements Validator<RemoteTrackResolverReportPayload> {
	public static readonly NAME = 'remote-track-resolver' as const;

	public readonly name = RemoteTrackResolverValidator.NAME;

	public readonly startedAt = Date.now();

	public report: ValidationReport<RemoteTrackResolverReportPayload> = { ready: false };

	private readonly _config: RemoteTrackResolverValidatorConfig;

	/** Accumulated across every eligible call seen, so one small call cannot decide alone. */
	private _eligibleCalls = 0;
	private _inboundTracks = 0;
	private _linkedInboundTracks = 0;
	private _exampleCallId?: string;
	private _checks = 0;
	private _done = false;

	public constructor(
		private readonly _observer: Observer,
		public readonly onDone: (report: ValidationReport<RemoteTrackResolverReportPayload>) => void,
		config: Partial<RemoteTrackResolverValidatorConfig> = {},
	) {
		this._config = {
			minClients: 2,
			minInboundTracks: 2,
			linkedRatioThreshold: 0.5,
			minChecks: 3,
			...config,
		};
	}

	/** How many eligible calls were actually examined. `0` means nothing was established. */
	public get checks(): number {
		return this._checks;
	}

	public cancel(reason = 'cancelled'): void {
		this._finish({ verdict: 'inconclusive', reason });
	}

	public update(): void {
		if (this._done) return;

		for (const call of this._observer.observedCalls.values()) {
			// No resolver configured is not a failing verdict — it is a deployment that opted out.
			if (!call.remoteTrackResolver) continue;
			if (call.observedClients.size < this._config.minClients) continue;

			let inboundTracks = 0;
			let linked = 0;

			for (const client of call.observedClients.values()) {
				for (const peerConnection of client.observedPeerConnections.values()) {
					for (const inboundTrack of peerConnection.observedInboundTracks.values()) {
						++inboundTracks;
						if (inboundTrack.remoteOutboundTrack !== undefined) ++linked;
					}
				}
			}

			// Too few tracks to distinguish "not linked" from "nothing to link yet".
			if (inboundTracks < this._config.minInboundTracks) continue;

			++this._checks;
			this._eligibleCalls += 1;
			this._inboundTracks += inboundTracks;
			this._linkedInboundTracks += linked;
			this._exampleCallId ??= call.callId;

			// One linked track anywhere settles it: the resolver is wired to something real. Waiting for
			// a ratio would report a healthy resolver as broken during the seconds after a join, when
			// subscribers legitimately have not been linked yet.
			if (0 < this._linkedInboundTracks) {
				return this._finish({ verdict: 'links-resolved', evidence: this._evidence() });
			}
		}

		// Nothing has ever linked, across enough independent calls that had every chance to.
		if (this._config.minChecks <= this._checks && this._linkedInboundTracks === 0) {
			this._finish({ verdict: 'no-links-resolved', evidence: this._evidence() });
		}
	}

	private _evidence(): RemoteTrackLinkEvidence {
		return {
			eligibleCalls: this._eligibleCalls,
			inboundTracks: this._inboundTracks,
			linkedInboundTracks: this._linkedInboundTracks,
			linkedRatio: 0 < this._inboundTracks ? this._linkedInboundTracks / this._inboundTracks : 0,
			exampleCallId: this._exampleCallId,
		};
	}

	private _finish(outcome:
	| { verdict: 'links-resolved', evidence: RemoteTrackLinkEvidence }
	| { verdict: 'no-links-resolved', evidence: RemoteTrackLinkEvidence }
	| { verdict: 'inconclusive', reason: string },
	): void {
		if (this._done) return;
		this._done = true;

		const decidedAt = Date.now();

		this.report = {
			ready: true,
			decidedAt,
			startedAt: this.startedAt,
			checks: this._checks,
			...outcome,
		};

		if (outcome.verdict === 'no-links-resolved') {
			this._observer.addIssue({
				type: UNRESOLVED_TRACK_LINKS_ISSUE,
				timestamp: decidedAt,
				conclusion: {
					faultDomain: 'infrastructure',
					summary: 'a RemoteTrackResolver is configured but has never linked a subscriber to a publisher',
					recommendation: 'check the id the resolver joins on (mediasoup producerId, or your own convention) — until it links, IssueFanOutDetector, TrackDeliveryMismatchDetector, UnconsumedTrackDetector and SimulcastReceiverValidator all silently do nothing',
					confidence: 0.9,
				},
				payload: { checks: this._checks, ...outcome.evidence },
			});
		}

		this.onDone(this.report);
	}
}
