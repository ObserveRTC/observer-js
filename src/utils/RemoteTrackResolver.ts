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

		observedCall.once('close', () => {
			observer.off('inbound-track-added', onInboundAdded);
			observer.off('inbound-track-removed', onInboundRemoved);
			observer.off('outbound-track-added', onOutboundAdded);
			observer.off('outbound-track-removed', onOutboundRemoved);
		});

		observer.on('inbound-track-added', onInboundAdded);
		observer.on('inbound-track-removed', onInboundRemoved);
		observer.on('outbound-track-added', onOutboundAdded);
		observer.on('outbound-track-removed', onOutboundRemoved);
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

		if (!publisherId) return;

		const subscriberId = this.resolvers.resolveInboundTrackSubscriberId?.(inboundTrack);

		if (subscriberId) {
			this._subscriberIdToInboundTrack.set(subscriberId, inboundTrack);
		}

		const outboundTrack = this._publisherIdToOutboundTrack.get(publisherId);

		if (!outboundTrack) return;

		outboundTrack.remoteInboundTracks.add(inboundTrack);
		inboundTrack.remoteOutboundTrack = outboundTrack;
	}

	private _removeInboundTrack(inboundTrack: ObservedInboundTrack) {
		// Use the stored link to unlink; no need to re-resolve the publisher id here.
		inboundTrack.remoteOutboundTrack?.remoteInboundTracks.delete(inboundTrack);
		inboundTrack.remoteOutboundTrack = undefined;

		const subscriberId = this.resolvers.resolveInboundTrackSubscriberId?.(inboundTrack);

		if (subscriberId) {
			this._subscriberIdToInboundTrack.delete(subscriberId);
		}
	}

	private _addOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		const publisherId = this.resolvers.resolveOutboundTrackPublisherId(outboundTrack);

		if (!publisherId) return;

		this._publisherIdToOutboundTrack.set(publisherId, outboundTrack);

		// Link any already-present subscribers of this publisher.
		for (const observedClient of this.observedCall.observedClients.values()) {
			for (const observedPeerConnection of observedClient.observedPeerConnections.values()) {
				for (const inboundTrack of observedPeerConnection.observedInboundTracks.values()) {
					if (this.resolvers.resolveInboundTrackPublisherId(inboundTrack) !== publisherId) continue;

					outboundTrack.remoteInboundTracks.add(inboundTrack);
					inboundTrack.remoteOutboundTrack = outboundTrack;
				}
			}
		}
	}

	private _removeOutboundTrack(outboundTrack: ObservedOutboundTrack) {
		const publisherId = this.resolvers.resolveOutboundTrackPublisherId(outboundTrack);

		// Only clear the map entry if it still points at this track (guards republish races).
		if (publisherId && this._publisherIdToOutboundTrack.get(publisherId) === outboundTrack) {
			this._publisherIdToOutboundTrack.delete(publisherId);
		}

		for (const inboundTrack of outboundTrack.remoteInboundTracks) {
			inboundTrack.remoteOutboundTrack = undefined;
		}
		outboundTrack.remoteInboundTracks.clear();
	}
}
