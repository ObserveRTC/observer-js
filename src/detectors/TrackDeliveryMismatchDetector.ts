import type { Detector } from './Detector';
import type { ObservedCall } from '../ObservedCall';
import { ActiveIssueTracker } from '../issues/ActiveIssueTracker';
import { ActiveClientIssue } from '../issues/ActiveClientIssue';

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

};

type DeliveryItem = {
	publisherClientId: string,
	publisherSending: boolean,
	publisherDryIssue: boolean,
	publisherBitrate: number,
	numberOfSubscribers: number,
	numberOfDrySubscribers: number,
}

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
export class TrackDeliveryMismatchDetector implements Detector, ActiveIssueTracker {
	public static readonly NAME = 'track-delivery-mismatch-detector' as const;
	public readonly name = TrackDeliveryMismatchDetector.NAME;

	private readonly _config: TrackDeliveryMismatchDetectorConfig;
	private readonly _lastRaisedAt = new Map<string, number>();
	private readonly dryOutboundTracks = new Set<string>();
	private readonly dryInboundTracks = new Set<string>();

	public constructor(
		private readonly call: ObservedCall,
		config: Partial<TrackDeliveryMismatchDetectorConfig> = {},
	) {
		this._config = {
			dryOutboundIssueType: 'dry-outbound-track',
			dryInboundIssueType: 'dry-inbound-track',
			minReceivers: 2,
			allReceiversRatio: 1,
			cooldownMs: 60_000,
			...config,
		};

		// Subscribe here, like every other tracker-shaped detector. Without this the dry-track sets
		// stay empty forever and `update()` silently judges every publisher as having zero dry
		// subscribers — the detector would run, cost time, and never be able to find anything.
		this.call.activeIssuesRegistry.addIssueTracker(this._config.dryOutboundIssueType, this);
		this.call.activeIssuesRegistry.addIssueTracker(this._config.dryInboundIssueType, this);
	}

	public close(): void {
		this.call.activeIssuesRegistry.removeIssueTracker(this);
		this._lastRaisedAt.clear();
		this.clear();
	}

	public add(issue: ActiveClientIssue): void {
		if (issue.type === this._config.dryOutboundIssueType) {
			if (issue.trackId) {
				this.dryOutboundTracks.add(issue.trackId);
			}
		} else if (issue.type === this._config.dryInboundIssueType) {
			if (issue.trackId) {
				this.dryInboundTracks.add(issue.trackId);
			}
		}
	}

	public delete(issue: ActiveClientIssue): boolean {
		if (issue.type === this._config.dryOutboundIssueType) {
			this.dryOutboundTracks.delete(issue.trackId ?? '');
		} else if (issue.type === this._config.dryInboundIssueType) {
			this.dryInboundTracks.delete(issue.trackId ?? '');
		}
		
		return true;
	}

	public get size(): number {
		return this.dryOutboundTracks.size + this.dryInboundTracks.size;
	}

	public clear(): void {
		this.dryOutboundTracks.clear();
		this.dryInboundTracks.clear();
	}

	public has(issue: ActiveClientIssue): boolean {
		if (issue.type === this._config.dryOutboundIssueType) {
			return this.dryOutboundTracks.has(issue.trackId ?? '');
		} else if (issue.type === this._config.dryInboundIssueType) {
			return this.dryInboundTracks.has(issue.trackId ?? '');
		}
		
		return false;
	}

	public update(): void {
		const now = Date.now();
		const deliveries = new Map<string, DeliveryItem>();

		for (const client of this.call.observedClients.values()) {
			for (const peerConnection of client.observedPeerConnections.values()) {
				for (const outboundTrack of peerConnection.observedOutboundTracks.values()) {
					deliveries.set(outboundTrack.id, {
						publisherClientId: client.clientId,
						publisherSending: (outboundTrack.bitrate ?? 0) > 0,
						publisherDryIssue: this.dryOutboundTracks.has(outboundTrack.id),
						publisherBitrate: outboundTrack.bitrate ?? 0,
						numberOfDrySubscribers: 0,
						numberOfSubscribers: 0,
					});
				}
				for (const inboundTrack of peerConnection.observedInboundTracks.values()) {
					const delivery = deliveries.get(inboundTrack.remoteOutboundTrack?.id ?? '');

					if (!delivery) {
						continue;
					}

					delivery.numberOfDrySubscribers += this.dryInboundTracks.has(inboundTrack.id) ? 1 : 0;
					delivery.numberOfSubscribers += 1;
				}
			}
		}

		for (const [ outboundTrackId, delivery ] of deliveries) {
			if (delivery.numberOfSubscribers < this._config.minReceivers) {
				continue;
			}

			// Nothing is wrong: the publisher is sending and no subscriber reported a dry track. Without
			// this the `else` branch below is unconditional, so a perfectly healthy call raises
			// RECEIVER_TRACK_NOT_DELIVERED for every published track, every cooldown period.
			if (delivery.publisherSending && delivery.numberOfDrySubscribers === 0) continue;

			const dryRatio = delivery.numberOfDrySubscribers / delivery.numberOfSubscribers;
			let type: string;

			if (!delivery.publisherSending) {
				type = TrackDeliveryMismatchTypes.publisherTrackDry;
			} else if (this._config.allReceiversRatio <= dryRatio) {
				type = TrackDeliveryMismatchTypes.publishedTrackNotDelivered;
			} else {
				type = TrackDeliveryMismatchTypes.receiverTrackNotDelivered;
			}

			const key = `${outboundTrackId}:${type}`;

			if (now - (this._lastRaisedAt.get(key) ?? 0) < this._config.cooldownMs) continue;

			this._lastRaisedAt.set(key, now);

			this.call.addIssue({
				type,
				timestamp: now,
				payload: {
					type,
					trackId: outboundTrackId,
					publisherClientId: delivery.publisherClientId,
					publisherSending: delivery.publisherSending,
					publisherDryIssue: delivery.publisherDryIssue,
					publisherBitrate: delivery.publisherBitrate,
					numberOfSubscribers: delivery.numberOfSubscribers,
					numberOfDrySubscribers: delivery.numberOfDrySubscribers,
				},
			});
		}
	}

}
