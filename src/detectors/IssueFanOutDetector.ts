import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import type { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import { concludeFrom } from './IssueConclusion';

export const IssueFanOutTypes = {
	/** Most receivers of one published track have the same issue open → the fault follows the source. */
	publishedTrackIssueFanOut: 'PUBLISHED_TRACK_ISSUE_FAN_OUT',

	/** Exactly one receiver of a track has it → that receiver's own problem. */
	singleReceiverIssue: 'SINGLE_RECEIVER_ISSUE',
} as const;

export type IssueFanOutDetectorConfig = {

	/** Only consider these issue types. Empty (default) = every type the receivers report. */
	issueTypes: string[];

	/** Minimum receivers of the track before a ratio is meaningful. Default `3`. */
	minReceivers: number;

	/** Fraction of a track's receivers that must share the issue. Default `0.6`. */
	affectedRatioThreshold: number;

	/** Also report the "only one receiver is affected" case. Default `true`. */
	reportSingleReceiver: boolean;

	/** Re-arm time (ms) per (track, issue type). Default `60_000`. */
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
 *   SFU's ingress, or its forwarding of that stream. Corroborated by whether the publisher's own
 *   egress looks healthy.
 * - **one receiver of Alice's track is affected** → that receiver's downlink. Nothing to do with
 *   Alice, even though the symptom is reported against her stream.
 *
 * Note this is deliberately generic over the issue vocabulary: `freezed-video-track`,
 * `keyframe-storm`, `audio-concealment`, `video-decoder-overloaded`, `stuck-decoder` and anything a
 * custom client detector invents all fan out the same way, so one mechanism replaces a family of
 * symptom-specific detectors.
 */
export class IssueFanOutDetector implements Detector {
	public readonly name = 'issue-fan-out-detector';

	private readonly _config: IssueFanOutDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly _call: ObservedCall,
		config: IssueFanOutDetectorConfig,
	) {
		this._config = config;
	}

	public update(): void {
		const now = Date.now();
		const wanted = new Set(this._config.issueTypes);

		for (const distribution of this._call.trackDistributionAggregator.aggregate()) {
			// The inbound track ids of every subscriber of this published track.
			const receiverTrackIds = new Map<string, string>();

			for (const receiver of distribution.receivers) {
				receiverTrackIds.set(receiver.observedInboundTrack.id, receiver.clientId);
			}

			const issues = this._call.issueIndex.byTrackIds(receiverTrackIds.keys())
				.filter((issue) => wanted.size === 0 || wanted.has(issue.type));

			if (issues.length === 0) continue;

			// group the open issues by type across this track's receivers
			const byType = new Map<string, Set<string>>();

			for (const issue of issues) {
				const clientIds = byType.get(issue.type) ?? new Set<string>();

				clientIds.add(issue.clientId);
				byType.set(issue.type, clientIds);
			}

			for (const [ issueType, clientIds ] of byType) {
				const affectedRatio = clientIds.size / distribution.numberOfReceivers;
				const isFanOut = this._config.minReceivers <= distribution.numberOfReceivers
					&& this._config.affectedRatioThreshold <= affectedRatio;
				const isSingle = this._config.reportSingleReceiver
					&& clientIds.size === 1 && 1 < distribution.numberOfReceivers;

				if (!isFanOut && !isSingle) continue;

				const key = `${distribution.trackId}:${issueType}`;

				if (now - (this._lastRaisedAt.get(key) ?? 0) < this._config.cooldownMs) continue;

				this._lastRaisedAt.set(key, now);

				const type = isFanOut
					? IssueFanOutTypes.publishedTrackIssueFanOut
					: IssueFanOutTypes.singleReceiverIssue;

				// What the fan-out implies. A track-scoped cohort is a strong statement: the affected
				// clients share a publisher and nothing else, so the receivers are exonerated.
				const conclusion = concludeFrom({
					issueType,
					scope: 'call',
					affectedClients: clientIds.size,
					totalClients: distribution.numberOfReceivers,
					affectedCalls: 1,
					totalCalls: 1,
					onsetBurst: false,
					publishedTrackId: isFanOut ? distribution.trackId : undefined,
				});

				this._call.addIssue({
					type,
					timestamp: now,
					payload: {
						type,
						issueType,
						conclusion,
						trackId: distribution.trackId,
						kind: distribution.kind,
						publisherClientId: distribution.publisher.clientId,
						// The corroborating half: if the source's own egress is clean while its
						// receivers are not, the SFU/forwarding path is implicated rather than the sender.
						publisherHealthy: distribution.publisher.healthy,
						publisherReasons: distribution.publisher.reasons,
						receivers: distribution.numberOfReceivers,
						affectedReceivers: clientIds.size,
						affectedRatio,
						affectedClientIds: [ ...clientIds ],
						// metric evidence alongside the client's verdict
						fractionLost: distribution.fractionLost,
						bitrate: distribution.bitrate,
						freezes: distribution.freezes,
						plis: distribution.plis,
					},
				});
			}
		}
	}

	public close(): void {
		this._lastRaisedAt.clear();
	}

	/** Exposed for tests/dashboards: the distributions this detector reasons over. */
	public distributionsOf(): ObservedOutboundTrack[] {
		return this._call.trackDistributionAggregator.aggregate().map((d) => d.publisher.observedOutboundTrack);
	}
}
