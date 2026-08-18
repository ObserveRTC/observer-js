import { ObservedCall } from '../ObservedCall';
import { ObservedInboundTrack } from '../ObservedInboundTrack';
import { ObservedOutboundTrack } from '../ObservedOutboundTrack';
import type { ObserverEvents } from '../ObserverEvents';

export type RemoteTrackResolverFactory = (observedCall: ObservedCall) => RemoteTrackResolver;

/**
 * Strategy functions that map a track to its publish/subscribe identity. Two tracks are linked
 * when a subscribed (inbound) track's **publisher id** equals a published (outbound) track's
 * **publisher id** — one publisher → many subscribers. The **subscriber id** is optional and is
 * only used to look an inbound track up via `getInboundTrackBySubscriberId`.
 *
 * The "publisher id" is whatever a strategy uses as the link key: mediasoup passes its producerId,
 * a p2p strategy the SSRC, a generic strategy a shared attachment value.
 */
export type RemoteTrackResolvers = {

	/** The publisher id a subscribed (inbound) track receives. Required — this is the link key. */
	resolveInboundTrackPublisherId: (inboundTrack: ObservedInboundTrack) => string | undefined,

	/** The publisher id a published (outbound) track represents. Required — this is the link key. */
	resolveOutboundTrackPublisherId: (outboundTrack: ObservedOutboundTrack) => string | undefined,

	/** Optional: the inbound track's own subscription id (enables `getInboundTrackBySubscriberId`). */
	resolveInboundTrackSubscriberId?: (inboundTrack: ObservedInboundTrack) => string | undefined,
};

/**
 * Generic, strategy-driven base resolver. It subscribes to the Observer bus (filtered to one call),
 * links subscribed↔published tracks by publisher id, and maintains the links directly on the tracks
 * (`inboundTrack.remoteOutboundTrack`, `outboundTrack.remoteInboundTracks`).
 *
 * Concrete strategies (mediasoup, p2p-by-SSRC, generic attachment) are just different
 * {@link RemoteTrackResolvers} passed to this class. Ids are re-resolved on demand rather than
 * cached, so the only state kept is the two lookup indexes that back the public getters.
 */
export class RemoteTrackResolver {
	private readonly _publisherIdToOutboundTrack = new Map<string, ObservedOutboundTrack>();
	private readonly _subscriberIdToInboundTrack = new Map<string, ObservedInboundTrack>();

	/**
	 * Tracks whose publisher id the strategy could not resolve **yet**.
	 *
	 * A track announces itself once, but its `attachments` are replaced on every sample, so a key that
	 * is missing from the first sample can appear on the second — and a strategy backed by an
	 * application's own mapping (a server-side `ssrc -> producerId` table, say) is inherently racy
	 * against sample arrival. Resolving only at `*-track-added` meant losing those tracks for their
	 * entire life, silently: an unresolvable outbound track never even reaches
	 * `unconsumedOutboundTracks`, so it is invisible to `UnconsumedTrackDetector` too.
	 *
	 * So they wait here and are retried on their own `*-track-updated`, i.e. exactly when new stats
	 * arrived for them. A track leaves on its first successful resolution or on removal, which makes
	 * a linked track cost one `Set.has` per update and bounds these sets by the unresolved tracks
	 * alive right now.
	 */
	private readonly _pendingInboundTracks = new Set<ObservedInboundTrack>();
	private readonly _pendingOutboundTracks = new Set<ObservedOutboundTrack>();

	public constructor(
		public readonly observedCall: ObservedCall,
		private readonly resolvers: RemoteTrackResolvers,
	) {
		const observer = observedCall.observer;

		// Subscribe to the central Observer bus, filtering to this call's tracks.
		const onInboundAdded = (p: ObserverEvents['inbound-track-added'][0]) => {
			if (p.observedCall === this.observedCall) this._addInboundTrack(p.observedInboundTrack);
		};
		const onInboundRemoved = (p: ObserverEvents['inbound-track-removed'][0]) => {
			if (p.observedCall === this.observedCall) this._removeInboundTrack(p.observedInboundTrack);
		};
		const onOutboundAdded = (p: ObserverEvents['outbound-track-added'][0]) => {
			if (p.observedCall === this.observedCall) this._addOutboundTrack(p.observedOutboundTrack);
		};
		const onOutboundRemoved = (p: ObserverEvents['outbound-track-removed'][0]) => {
			if (p.observedCall === this.observedCall) this._removeOutboundTrack(p.observedOutboundTrack);
		};

		// Retry, and only for what is actually waiting — see `_pendingInboundTracks`.
		const onInboundUpdated = (p: ObserverEvents['inbound-track-updated'][0]) => {
			if (p.observedCall !== this.observedCall) return;
			if (this._pendingInboundTracks.has(p.observedInboundTrack)) this._addInboundTrack(p.observedInboundTrack);
		};
		const onOutboundUpdated = (p: ObserverEvents['outbound-track-updated'][0]) => {
			if (p.observedCall !== this.observedCall) return;
			if (this._pendingOutboundTracks.has(p.observedOutboundTrack)) this._addOutboundTrack(p.observedOutboundTrack);
		};

		observedCall.once('close', () => {
			observer.off('inbound-track-added', onInboundAdded);
			observer.off('inbound-track-removed', onInboundRemoved);
			observer.off('outbound-track-added', onOutboundAdded);
			observer.off('outbound-track-removed', onOutboundRemoved);
			observer.off('inbound-track-updated', onInboundUpdated);
			observer.off('outbound-track-updated', onOutboundUpdated);
			this._pendingInboundTracks.clear();
			this._pendingOutboundTracks.clear();
		});

		observer.on('inbound-track-added', onInboundAdded);
		observer.on('inbound-track-removed', onInboundRemoved);
		observer.on('outbound-track-added', onOutboundAdded);
		observer.on('outbound-track-removed', onOutboundRemoved);
		observer.on('inbound-track-updated', onInboundUpdated);
		observer.on('outbound-track-updated', onOutboundUpdated);
	}

	/** Tracks still waiting for a resolvable publisher id. Diagnostics; normally both are empty. */
	public get pendingTrackCounts(): { inbound: number, outbound: number } {
		return { inbound: this._pendingInboundTracks.size, outbound: this._pendingOutboundTracks.size };
	}

	/** The published (outbound) track for a publisher id, if any. */
	public getOutboundTrackByPublisherId(publisherId: string): ObservedOutboundTrack | undefined {
		return this._publisherIdToOutboundTrack.get(publisherId);
	}

	/** The subscribed (inbound) track for a subscriber id, if the strategy resolves subscriber ids. */
	public getInboundTrackBySubscriberId(subscriberId: string): ObservedInboundTrack | undefined {
		return this._subscriberIdToInboundTrack.get(subscriberId);
	}

	// RemoteTrackResolver interface — thin readers over the links maintained on the tracks.
	public resolveRemoteOutboundTrack(inboundTrack: ObservedInboundTrack): ObservedOutboundTrack | undefined {
		return inboundTrack.remoteOutboundTrack;
	}

	public resolveRemoteInboundTracks(outboundTrack: ObservedOutboundTrack): ObservedInboundTrack[] | undefined {
		return [ ...outboundTrack.remoteInboundTracks ];
	}

	private _addInboundTrack(inboundTrack: ObservedInboundTrack) {
		const publisherId = this.resolvers.resolveInboundTrackPublisherId(inboundTrack);

		if (!publisherId) {
			this._pendingInboundTracks.add(inboundTrack);

			return;
		}

		this._pendingInboundTracks.delete(inboundTrack);

		const subscriberId = this.resolvers.resolveInboundTrackSubscriberId?.(inboundTrack);

		if (subscriberId) {
			this._subscriberIdToInboundTrack.set(subscriberId, inboundTrack);
		}

		const outboundTrack = this._publisherIdToOutboundTrack.get(publisherId);

		if (!outboundTrack) return;

		outboundTrack.remoteInboundTracks.add(inboundTrack);
		inboundTrack.remoteOutboundTrack = outboundTrack;
		// It now has a subscriber, so it is no longer a candidate for "published to nobody".
		this.observedCall.unconsumedOutboundTracks.delete(outboundTrack);
	}

	private _removeInboundTrack(inboundTrack: ObservedInboundTrack) {
		this._pendingInboundTracks.delete(inboundTrack);

		// Use the stored link to unlink; no need to re-resolve the publisher id here.
		const outboundTrack = inboundTrack.remoteOutboundTrack;

		outboundTrack?.remoteInboundTracks.delete(inboundTrack);
		inboundTrack.remoteOutboundTrack = undefined;

		// That may have been its last subscriber — one of the two moments the answer can change.
		if (outboundTrack && outboundTrack.remoteInboundTracks.size === 0) {
			this.observedCall.unconsumedOutboundTracks.add(outboundTrack);
		}

		const subscriberId = this.resolvers.resolveInboundTrackSubscriberId?.(inboundTrack);

		if (subscriberId) {
			this._subscriberIdToInboundTrack.delete(subscriberId);
		}
	}

	private _addOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		const publisherId = this.resolvers.resolveOutboundTrackPublisherId(outboundTrack);

		if (!publisherId) {
			this._pendingOutboundTracks.add(outboundTrack);

			return;
		}

		this._pendingOutboundTracks.delete(outboundTrack);

		this._publisherIdToOutboundTrack.set(publisherId, outboundTrack);
		// Unconsumed until a subscriber links below — a new publisher legitimately starts this way.
		this.observedCall.unconsumedOutboundTracks.add(outboundTrack);

		// Link any already-present subscribers of this publisher.
		for (const observedClient of this.observedCall.observedClients.values()) {
			for (const observedPeerConnection of observedClient.observedPeerConnections.values()) {
				for (const inboundTrack of observedPeerConnection.observedInboundTracks.values()) {
					if (this.resolvers.resolveInboundTrackPublisherId(inboundTrack) !== publisherId) continue;

					outboundTrack.remoteInboundTracks.add(inboundTrack);
					inboundTrack.remoteOutboundTrack = outboundTrack;
					this.observedCall.unconsumedOutboundTracks.delete(outboundTrack);
				}
			}
		}
	}

	private _removeOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		this._pendingOutboundTracks.delete(outboundTrack);

		const publisherId = this.resolvers.resolveOutboundTrackPublisherId(outboundTrack);

		// Only clear the map entry if it still points at this track (guards republish races).
		if (publisherId && this._publisherIdToOutboundTrack.get(publisherId) === outboundTrack) {
			this._publisherIdToOutboundTrack.delete(publisherId);
		}

		for (const inboundTrack of outboundTrack.remoteInboundTracks) {
			inboundTrack.remoteOutboundTrack = undefined;
		}
		outboundTrack.remoteInboundTracks.clear();
		this.observedCall.unconsumedOutboundTracks.delete(outboundTrack);
	}
}
