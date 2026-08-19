import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import type { ActiveClientIssue } from '../issues/ActiveClientIssue';
import type { ActiveIssueTracker } from '../issues/ActiveIssueTracker';
import { concludeCallIssue } from './IssueConclusion';

export const IssueFanOutTypes = {
	/** Most receivers of one published track have the same issue open → the fault follows the source. */
	publishedTrackIssueFanOut: 'PUBLISHED_TRACK_ISSUE_FAN_OUT',

	/** Exactly one receiver of a track has it → that receiver's own problem. */
	singleReceiverIssue: 'SINGLE_RECEIVER_ISSUE',
} as const;

export type IssueFanOutDetectorConfig = {

	/**
	 * The receiver-side issue types to attribute to publishers. **Required, and must not be empty** —
	 * the detector subscribes to exactly these.
	 *
	 * There is no "all types" option. Which of a receiver's complaints are worth blaming a publisher
	 * for is application knowledge: `freezed-video-track` fanning out across a track's subscribers
	 * implicates the source, `cpulimitation` fanning out the same way implicates the receivers'
	 * hardware and would be a false accusation.
	 */
	issueTypes: string[];

	/**
	 * Receivers a track needs before a ratio means anything. Default `3`.
	 *
	 * With two receivers, "60% affected" is one of them — which is the single-receiver case below, not
	 * a fan-out. Sensible range `2`–`5`; in small calls a published track rarely has more than a couple
	 * of subscribers, so raising this can silence the detector entirely.
	 */
	minReceivers: number;

	/**
	 * Fraction of a track's receivers that must share the issue, `0`–`1`. Default `0.6`.
	 *
	 * The higher this is, the more the finding points at the publisher rather than at the network
	 * between: *everyone* receiving this track badly is hard to explain any other way. Typical
	 * `0.5`–`0.8`. Below `0.5` you are reporting "some receivers", which usually means their own
	 * last miles.
	 */
	affectedRatioThreshold: number;

	/**
	 * Also report when exactly one receiver is affected. Default `true`.
	 *
	 * Kept on because the finding is *useful and correctly weaker*: it is raised with a lower
	 * confidence and the opposite conclusion — one unhappy receiver out of eight points at that
	 * receiver, not at the publisher. Turn it off if you only want publisher-blaming findings and
	 * treat single-receiver trouble as the client's own business.
	 */
	reportSingleReceiver: boolean;

	/**
	 * Re-arm time per (track, issue type) in ms. Default `60_000`.
	 *
	 * Per track, so a call with many bad publishers still reports each of them. Typical
	 * `30_000`–`300_000`.
	 */
	cooldownMs: number;
};

/**
 * Attributes **client-reported issues to the published track they are about**, then asks how far
 * the problem fans out across that track's receivers.
 *
 * The join is what makes this possible: a receiver-side issue payload carries `trackId` (the client
 * detectors report it for every track-scoped issue), the observer resolves that to an inbound track,
 * and `RemoteTrackResolver` links the inbound track to the `remoteOutboundTrack` that published it.
 * With the whole subscriber set of one source in hand, the verdict is straightforward and is the
 * single most useful thing a server can say:
 *
 * - **most receivers of Alice's track are affected** → the fault is on Alice's path — her uplink, the
 *   SFU's ingress, or its forwarding of that stream.
 * - **one receiver of Alice's track is affected** → that receiver's downlink. Nothing to do with
 *   Alice, even though the symptom is reported against her stream.
 *
 * Deliberately generic over the issue vocabulary: `freezed-video-track`, `keyframe-storm`,
 * `audio-concealment`, `video-decoder-overloaded`, `stuck-decoder` and anything a custom client
 * detector invents all fan out the same way, so one mechanism replaces a family of symptom-specific
 * detectors.
 *
 * ### It walks the affected tracks, never all of them
 *
 * The detector is fed open issues by the call's registry and keeps only those carrying a `trackId`.
 * Each tick it resolves *those* tracks to their publishers — never the published tracks of the call,
 * of which there are many more and almost all of them fine. A call with nothing wrong costs one
 * `size === 0` check.
 *
 * ### Requires a `RemoteTrackResolver`
 *
 * Without publisher↔subscriber links there is no way to know which receivers belong to one source,
 * so the detector does nothing when the call has no resolver. It does not fall back to guessing:
 * "one receiver of an unknown set" is not a statement worth raising.
 */
export class IssueFanOutDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'issue-fan-out-detector';

	public readonly name = IssueFanOutDetector.NAME;

	private readonly _config: IssueFanOutDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();

	/** Open issues that name a track. Issues without a `trackId` cannot be attributed and are dropped. */
	private readonly _trackIssues = new Set<ActiveClientIssue>();

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<IssueFanOutDetectorConfig> = {},
	) {
		this._config = {
			issueTypes: [],
			minReceivers: 3,
			affectedRatioThreshold: 0.6,
			reportSingleReceiver: true,
			cooldownMs: 60_000,
			...config,
		};

		for (const type of this._config.issueTypes) {
			this._call.activeIssuesRegistry.addIssueTracker(type, this);
		}
	}

	public get size(): number {
		return this._trackIssues.size;
	}

	public has(issue: ActiveClientIssue): boolean {
		return this._trackIssues.has(issue);
	}

	public add(issue: ActiveClientIssue): void {
		// An issue with no `trackId` says nothing about a published track; holding it would only make
		// `size` lie about how much there is to do.
		if (issue.trackId === undefined) return;

		this._trackIssues.add(issue);
	}

	public delete(issue: ActiveClientIssue): boolean {
		return this._trackIssues.delete(issue);
	}

	public clear(): void {
		this._trackIssues.clear();
	}

	public update(): void {
		if (this._trackIssues.size === 0) return;
		// Without links, "the receivers of this track" is unknowable — never guess.
		if (!this._call.remoteTrackResolver) return;

		const now = Date.now();
		// publisher track -> issue type -> the affected receiver client ids.
		const byPublisher = new Map<ObservedOutboundTrack, Map<string, Set<string>>>();

		for (const issue of this._trackIssues) {
			const publisher = this._publisherOf(issue);

			if (!publisher) continue;

			let byType = byPublisher.get(publisher);

			if (!byType) {
				byType = new Map();
				byPublisher.set(publisher, byType);
			}

			const clientIds = byType.get(issue.type) ?? new Set<string>();

			clientIds.add(issue.clientId);
			byType.set(issue.type, clientIds);
		}

		for (const [ publisher, byType ] of byPublisher) {
			const numberOfReceivers = publisher.remoteInboundTracks.size;

			if (numberOfReceivers === 0) continue;

			for (const [ issueType, clientIds ] of byType) {
				// A receiver may hold several issues of one type (one per track); the unit is the client,
				// and `clientIds` is already a set, so the ratio can never exceed 1.
				const affectedRatio = clientIds.size / numberOfReceivers;
				const isFanOut = this._config.minReceivers <= numberOfReceivers
					&& this._config.affectedRatioThreshold <= affectedRatio;
				const isSingle = this._config.reportSingleReceiver
					&& clientIds.size === 1 && 1 < numberOfReceivers;

				if (!isFanOut && !isSingle) continue;

				const key = `${publisher.id}:${issueType}`;

				if (now - (this._lastRaisedAt.get(key) ?? 0) < this._config.cooldownMs) continue;

				this._lastRaisedAt.set(key, now);

				const type = isFanOut
					? IssueFanOutTypes.publishedTrackIssueFanOut
					: IssueFanOutTypes.singleReceiverIssue;

				// What the fan-out implies. A track-scoped group is a strong statement: the affected
				// clients share a publisher and nothing else, so the receivers are exonerated.
				const conclusion = concludeCallIssue({
					issueType,
					affectedClients: clientIds.size,
					totalClients: numberOfReceivers,
					onsetBurst: false,
					publishedTrackId: isFanOut ? publisher.id : undefined,
				});

				this._call.addIssue({
					type,
					timestamp: now,
					conclusion,
					payload: {
						issueType,
						trackId: publisher.id,
						kind: publisher.kind,
						publisherClientId: publisher.getPeerConnection().client.clientId,
						// The corroborating half: if the source's own egress looks fine while its
						// receivers do not, the SFU/forwarding path is implicated rather than the sender.
						publisherBitrate: publisher.bitrate,
						publisherDegraded: publisher.degraded,
						publisherDegradedReasons: publisher.degradedReasons,
						receivers: numberOfReceivers,
						affectedReceivers: clientIds.size,
						affectedRatio,
						affectedClientIds: [ ...clientIds ],
					},
				});
			}
		}
	}

	public close(): void {
		this._call.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	/**
	 * Resolve the issue's `trackId` to the outbound track that published it.
	 *
	 * Looked up through the reporting client's own peer connections rather than by scanning the call:
	 * the issue names its client, so the search is bounded by that client's transports (typically one
	 * or two) instead of by the size of the meeting.
	 */
	private _publisherOf(issue: ActiveClientIssue): ObservedOutboundTrack | undefined {
		const client = this._call.observedClients.get(issue.clientId);

		if (!client || issue.trackId === undefined) return undefined;

		for (const peerConnection of client.observedPeerConnections.values()) {
			const inboundTrack = peerConnection.observedInboundTracks.get(issue.trackId);

			if (inboundTrack) return inboundTrack.remoteOutboundTrack;
		}

		return undefined;
	}
}
