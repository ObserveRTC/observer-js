import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import { IssueRegistry, IssueRegistryConfig } from '../utils/IssueRegistry';
import { TrackDistributionAggregator } from '../utils/TrackDistributionAggregator';

export const TrackDeliveryMismatchTypes = {
	/**
	 * The source is sending, but **none** of its subscribers are receiving → the media is being lost
	 * between the publisher and the receivers. In an SFU that means the forwarding path.
	 */
	publishedTrackNotDelivered: 'PUBLISHED_TRACK_NOT_DELIVERED',

	/**
	 * The source is sending and most subscribers are fine, but **some** are dry → those consumers are
	 * broken individually (in mediasoup, the usual mitigation is recreating the consumer).
	 */
	receiverTrackNotDelivered: 'RECEIVER_TRACK_NOT_DELIVERED',

	/**
	 * The source itself stopped producing, so its subscribers being dry is expected and **not** an
	 * SFU fault. Reported so the other two verdicts can be trusted as *not* being this.
	 */
	publisherTrackDry: 'PUBLISHER_TRACK_DRY',
} as const;

export type TrackDeliveryMismatchDetectorConfig = {

	/** The receiver-side issue type meaning "no media arriving". Default `'dry-inbound-track'`. */
	dryInboundIssueType: string;

	/** The publisher-side issue type meaning "not producing". Default `'dry-outbound-track'`. */
	dryOutboundIssueType: string;

	/** Minimum subscribers before "all of them" means anything. Default `2`. */
	minReceivers: number;

	/** Fraction of subscribers that must be dry to call it a whole-track delivery failure. Default `1`. */
	allReceiversRatio: number;

	/** Re-arm time (ms) per (track, verdict). Default `60_000`. */
	cooldownMs: number;

	registry?: Partial<IssueRegistryConfig>;
};

const defaultConfig: TrackDeliveryMismatchDetectorConfig = {
	dryInboundIssueType: 'dry-inbound-track',
	dryOutboundIssueType: 'dry-outbound-track',
	minReceivers: 2,
	allReceiversRatio: 1,
	cooldownMs: 60_000,
};

/**
 * Answers **"is the media actually getting through?"** by joining the two ends of a published track.
 *
 * A dry track is the clearest possible symptom — no bytes are arriving — but on its own it is
 * ambiguous, and the ambiguity is precisely what a single endpoint cannot resolve. A receiver seeing
 * silence cannot tell whether the camera was switched off, the SFU stopped forwarding, or its own
 * consumer wedged. All three look identical from the browser.
 *
 * With the publisher↔subscriber links this becomes a three-way decision:
 *
 * | publisher | subscribers | verdict |
 * |---|---|---|
 * | sending | **all** dry | `PUBLISHED_TRACK_NOT_DELIVERED` — the SFU/forwarding path |
 * | sending | **some** dry | `RECEIVER_TRACK_NOT_DELIVERED` — those consumers (recreate them) |
 * | dry | any dry | `PUBLISHER_TRACK_DRY` — the source stopped; not an SFU fault |
 *
 * The publisher side is judged from **both** signals available: its own `dry-outbound-track` issue
 * when the client reports one, and — as the fallback, and the corroboration when it does not — the
 * observed outbound RTP (`deltaPacketsSent`). That combination is what makes the first row
 * trustworthy: the server can state that packets demonstrably left the publisher during the same
 * interval in which every receiver got nothing.
 *
 * This is the "SFU forwarding mismatch" check, and notably it needs **no** mediasoup instrumentation
 * — the client's own dry-track verdicts plus the resolver links are sufficient.
 */
export class TrackDeliveryMismatchDetector implements Detector {
	public readonly name = 'track-delivery-mismatch-detector';

	private readonly _config: TrackDeliveryMismatchDetectorConfig;
	private readonly _registry: IssueRegistry;
	private readonly _aggregator: TrackDistributionAggregator;
	private readonly _lastRaisedAt = new Map<string, number>();

	public constructor(
		private readonly _call: ObservedCall,
		config: Partial<TrackDeliveryMismatchDetectorConfig> = {},
	) {
		this._config = { ...defaultConfig, ...config };
		this._registry = new IssueRegistry(_call, config.registry);
		this._aggregator = new TrackDistributionAggregator(_call);
	}

	public update(): void {
		const now = Date.now();

		for (const distribution of this._aggregator.aggregate()) {
			if (distribution.numberOfReceivers < this._config.minReceivers) continue;

			const receiverTrackIds = new Set(distribution.receivers.map((r) => r.observedInboundTrack.id));
			const dryReceiverIds = new Set(
				this._registry.byTrackIds(receiverTrackIds, now)
					.filter((issue) => issue.type === this._config.dryInboundIssueType)
					.map((issue) => issue.clientId),
			);

			if (dryReceiverIds.size === 0) continue;

			// Is the source actually producing? Prefer its own verdict, corroborate with the RTP.
			const publisherDryIssue = this._registry
				.byClientId(distribution.publisher.clientId, now)
				.some((issue) => issue.type === this._config.dryOutboundIssueType
					&& (issue.trackId === undefined || issue.trackId === distribution.trackId));
			const publisherSending = !publisherDryIssue && 0 < distribution.publisher.deltaPacketsSent;

			const dryRatio = dryReceiverIds.size / distribution.numberOfReceivers;
			let type: string;

			if (!publisherSending) {
				type = TrackDeliveryMismatchTypes.publisherTrackDry;
			} else if (this._config.allReceiversRatio <= dryRatio) {
				type = TrackDeliveryMismatchTypes.publishedTrackNotDelivered;
			} else {
				type = TrackDeliveryMismatchTypes.receiverTrackNotDelivered;
			}

			const key = `${distribution.trackId}:${type}`;

			if (now - (this._lastRaisedAt.get(key) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(key, now);

			this._call.addIssue({
				type,
				timestamp: now,
				payload: JSON.stringify({
					type,
					trackId: distribution.trackId,
					kind: distribution.kind,
					publisherClientId: distribution.publisher.clientId,
					publisherSending,
					publisherDryIssue,
					publisherBitrate: distribution.publisher.bitrate,
					publisherDeltaPacketsSent: distribution.publisher.deltaPacketsSent,
					receivers: distribution.numberOfReceivers,
					dryReceivers: dryReceiverIds.size,
					dryRatio,
					dryClientIds: [ ...dryReceiverIds ],
					healthyClientIds: distribution.receivers
						.map((r) => r.clientId)
						.filter((clientId) => !dryReceiverIds.has(clientId)),
				}),
			});
		}
	}

	public close(): void {
		this._lastRaisedAt.clear();
	}
}
