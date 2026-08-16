import type { Observer } from '../Observer';
import type { Validator, ValidationReport } from './Validator';

/** Raised once if the deployment is not actually delivering the codec it thinks it is. */
export const CODEC_MISMATCH_ISSUE = 'CODEC_INCONSISTENCY';

/** What the check saw across a call's participants. */
export type CodecEvidence = {
	callId: string;
	kind: 'audio' | 'video';

	/** Every mime type in use in that call, most common first — e.g. `[ 'video/VP8', 'video/H264' ]`. */
	mimeTypes: string[];

	/** How many clients used each, in the same order as {@link mimeTypes}. */
	clientsPerMimeType: number[];

	/** Clients considered — those that reported at least one codec of this kind. */
	clients: number;

	/** The codec the check was told to expect, when it was given one. */
	expected?: string;
};

export type CodecConsistencyReportPayload = ({

	/** One codec per media kind, and it is the expected one if an expectation was given. */
	verdict: 'codec-consistent';
	evidence: CodecEvidence[];
} | {

	/** Participants of one call are split across different codecs. */
	verdict: 'codec-split';
	evidence: CodecEvidence[];
} | {

	/** Consistent, but not what the deployment believes it negotiated. */
	verdict: 'unexpected-codec';
	evidence: CodecEvidence[];
} | {

	/** Never saw a call with enough participants reporting codecs. **Not a pass.** */
	verdict: 'inconclusive';
	reason: string;
}) & {
	startedAt: number;
	checks: number;
};

export type CodecConsistencyValidatorConfig = {

	/**
	 * The mime type you believe you are delivering, per kind — e.g.
	 * `{ video: 'video/VP8', audio: 'audio/opus' }`.
	 *
	 * Optional. Without it the check still reports a *split* (participants disagreeing with each
	 * other), which needs no expectation to be a fact. With it, the check can additionally catch the
	 * case where everyone agrees on the wrong thing — a silent fallback that nothing else notices.
	 */
	expected?: Partial<Record<'audio' | 'video', string>>;

	/** Which kinds to inspect. Default both. */
	kinds: ('audio' | 'video')[];

	/** Participants a call needs before disagreement is meaningful. Default `3`. */
	minClients: number;

	/** Calls to inspect before concluding. Default `3`. */
	minChecks: number;
};

type KindTally = { mimeTypes: Map<string, Set<string>> };

/**
 * Answers: **is every participant of a call actually using the same codec — and is it the one you
 * think you negotiated?**
 *
 * ### Why the server has to answer this
 *
 * A client knows only its own codec. It cannot tell whether it is the odd one out, and an SFU that
 * forwards without transcoding cannot serve a call where participants disagree — so a split is a
 * real fault with a very confusing symptom: some pairs of participants see each other and some do
 * not, with no error anywhere. Only something holding every participant of a call at once can see
 * the split at all.
 *
 * The second half is the quieter failure. A deployment configured for VP9 or AV1 will fall back to
 * VP8 whenever one endpoint cannot negotiate the preferred codec, and nothing reports that — the
 * call works, the bitrate is higher than it should be, and the team believes it shipped AV1 months
 * ago. Give the check an `expected` mime type and it will say so.
 *
 * ### Why a validator and not a detector
 *
 * The answer is a property of the deployment — SDP munging, codec preferences, the SFU build — not
 * of this moment. A deployment that negotiates VP8 at 09:00 negotiates VP8 at 17:00. Re-deriving it
 * every tick would walk every codec of every peer connection of every call, forever, to re-learn a
 * constant. So it decides once and stops.
 *
 * Start it again after a deploy, or after changing codec preferences:
 *
 * ```ts
 * observer.addValidator('codec-consistency', {
 *   expected: { video: 'video/VP9', audio: 'audio/opus' },
 * });
 *
 * observer.on('validation-ready', ({ validator, report }) => {
 *   if (validator !== 'codec-consistency' || !report.ready) return;
 *   // 'codec-consistent' | 'codec-split' | 'unexpected-codec' | 'inconclusive'
 * });
 * ```
 *
 * ### `inconclusive` is not a pass
 *
 * Only calls with at least `minClients` participants *reporting codecs of that kind* count as a
 * check. An audio-only deployment will never say anything about video, and concluding "video codecs
 * are consistent" from calls that carried no video would verify nothing.
 *
 * ### Comparison is by mime type only
 *
 * `sdpFmtpLine` carries profile and level — `profile-level-id` for H.264, `profile-id` for VP9 — and
 * two clients on the same mime type with different profiles are not truly interchangeable. That is
 * deliberately out of scope: fmtp differences are common, usually benign, and would make this check
 * noisy enough to ignore. It answers the coarse question, which is the one that is actually wrong in
 * practice.
 */
export class CodecConsistencyValidator implements Validator<CodecConsistencyReportPayload> {
	public static readonly NAME = 'codec-consistency' as const;

	public readonly name = CodecConsistencyValidator.NAME;

	public readonly startedAt = Date.now();

	public report: ValidationReport<CodecConsistencyReportPayload> = { ready: false };

	private readonly _config: CodecConsistencyValidatorConfig;
	private readonly _inspectedCallIds = new Set<string>();
	private _evidence: CodecEvidence[] = [];
	private _checks = 0;
	private _done = false;

	public constructor(
		private readonly _observer: Observer,
		public readonly onDone: (report: ValidationReport<CodecConsistencyReportPayload>) => void,
		config: Partial<CodecConsistencyValidatorConfig> = {},
	) {
		this._config = {
			kinds: [ 'audio', 'video' ],
			minClients: 3,
			minChecks: 3,
			...config,
		};
	}

	public get checks(): number {
		return this._checks;
	}

	public cancel(reason = 'cancelled'): void {
		this._finish({ verdict: 'inconclusive', reason });
	}

	public update(): void {
		if (this._done) return;

		for (const call of this._observer.observedCalls.values()) {
			// One verdict per call. Without this a long-lived call would be re-counted every tick and
			// `minChecks` would be satisfied by a single call observed three times.
			if (this._inspectedCallIds.has(call.callId)) continue;
			if (call.observedClients.size < this._config.minClients) continue;

			const tallies = this._tallyOf(call.callId);

			if (tallies.length === 0) continue;

			this._inspectedCallIds.add(call.callId);
			++this._checks;
			this._evidence.push(...tallies);

			// A split is decisive on its own: participants of one call disagreeing is a fault whatever
			// the other calls do, so there is nothing to be gained by waiting.
			const split = tallies.find((evidence) => 1 < evidence.mimeTypes.length);

			if (split) return this._finish({ verdict: 'codec-split', evidence: this._evidence });
		}

		if (this._checks < this._config.minChecks) return;

		const unexpected = this._evidence.filter(
			(evidence) => evidence.expected !== undefined && evidence.mimeTypes[0] !== evidence.expected,
		);

		if (0 < unexpected.length) {
			return this._finish({ verdict: 'unexpected-codec', evidence: this._evidence });
		}

		this._finish({ verdict: 'codec-consistent', evidence: this._evidence });
	}

	/** One evidence entry per configured kind that the call actually carried. */
	private _tallyOf(callId: string): CodecEvidence[] {
		const call = this._observer.observedCalls.get(callId);

		if (!call) return [];

		const byKind = new Map<'audio' | 'video', KindTally>();

		for (const client of call.observedClients.values()) {
			for (const peerConnection of client.observedPeerConnections.values()) {
				for (const codec of peerConnection.observedCodecs.values()) {
					const kind = mediaKindOf(codec.mimeType);

					if (kind === undefined || !this._config.kinds.includes(kind)) continue;

					const tally = byKind.get(kind) ?? { mimeTypes: new Map<string, Set<string>>() };
					const clientIds = tally.mimeTypes.get(codec.mimeType) ?? new Set<string>();

					// Counted per client, not per codec entry: a peer connection lists every negotiated
					// codec, including ones it never sends with, and counting those would report a split
					// in every call on earth.
					clientIds.add(client.clientId);
					tally.mimeTypes.set(codec.mimeType, clientIds);
					byKind.set(kind, tally);
				}
			}
		}

		const evidence: CodecEvidence[] = [];

		for (const [ kind, tally ] of byKind) {
			const ranked = [ ...tally.mimeTypes.entries() ].sort((a, b) => b[1].size - a[1].size);
			const clients = new Set<string>();

			for (const [ , clientIds ] of ranked) {
				for (const clientId of clientIds) clients.add(clientId);
			}

			if (clients.size < this._config.minClients) continue;

			evidence.push({
				callId,
				kind,
				mimeTypes: ranked.map(([ mimeType ]) => mimeType),
				clientsPerMimeType: ranked.map(([ , clientIds ]) => clientIds.size),
				clients: clients.size,
				expected: this._config.expected?.[kind],
			});
		}

		return evidence;
	}

	private _finish(outcome:
	| { verdict: 'codec-consistent', evidence: CodecEvidence[] }
	| { verdict: 'codec-split', evidence: CodecEvidence[] }
	| { verdict: 'unexpected-codec', evidence: CodecEvidence[] }
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

		if (outcome.verdict === 'codec-split' || outcome.verdict === 'unexpected-codec') {
			this._observer.addIssue({
				type: CODEC_MISMATCH_ISSUE,
				timestamp: decidedAt,
				conclusion: {
					faultDomain: 'infrastructure',
					summary: outcome.verdict === 'codec-split'
						? 'participants of one call are using different codecs — an SFU that forwards without transcoding cannot serve all of them'
						: 'the deployment is consistently negotiating a codec other than the expected one',
					recommendation: outcome.verdict === 'codec-split'
						? 'check codec preferences and any SDP munging; a split usually means one endpoint could not negotiate the preferred codec and the others were not renegotiated with it'
						: 'check codec preferences and endpoint support — a silent fallback keeps working, at a higher bitrate than you budgeted for',
					confidence: 0.85,
				},
				payload: {
					verdict: outcome.verdict,
					checks: this._checks,
					evidence: outcome.evidence,
				},
			});
		}

		this.onDone(this.report);
	}
}

/** `'video/VP8'` -> `'video'`. `undefined` for anything that is not an audio/video mime type. */
function mediaKindOf(mimeType: string): 'audio' | 'video' | undefined {
	if (mimeType.startsWith('video/')) return 'video';
	if (mimeType.startsWith('audio/')) return 'audio';

	return undefined;
}
