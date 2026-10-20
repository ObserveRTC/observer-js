import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import type { ObservedOutboundTrack } from '../src/ObservedOutboundTrack';
import type { ClientSample, PeerConnectionSample } from '../src/schema/ClientSample';
import { makeSample, nextTimestamp } from './helpers/samples';

/**
 * A producer recreated with the same MediaStreamTrack (reconnection, toggling audio processing): the
 * new sender reports a new media source and new outbound RTPs with the same `trackIdentifier`, while
 * the client keeps reporting the old ones with frozen counters.
 */

const TRACK_ID = 'mic-track';

type Publication = { mediaSourceId: string, ssrc: number, producerId: string, packetsSent: number };

function publisherSample(publications: Publication[], current: Publication): ClientSample {
	const timestamp = nextTimestamp();
	const pc = {
		peerConnectionId: 'pub-pc',
		mediaSources: publications.map((p) => ({ timestamp, id: p.mediaSourceId, kind: 'audio', trackIdentifier: TRACK_ID })),
		outboundRtps: publications.map((p) => ({
			timestamp, id: `rtp-${p.ssrc}`, ssrc: p.ssrc, kind: 'audio', mediaSourceId: p.mediaSourceId,
			packetsSent: p.packetsSent, bytesSent: p.packetsSent * 100,
		})),
		outboundTracks: [ { timestamp, id: TRACK_ID, kind: 'audio', attachments: { producerId: current.producerId } } ],
	} as unknown as PeerConnectionSample;

	return { timestamp, callId: 'call-1', clientId: 'publisher', peerConnections: [ pc ] };
}

const consumerSample = (producerId: string) => makeSample({
	clientId: 'consumer',
	peerConnections: [ { peerConnectionId: 'sub-pc', inbound: [ { trackId: `in-${producerId}`, attachments: { producerId, consumerId: `c-${producerId}` } } ] } ],
});

function setup() {
	const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(), closeCallIfEmptyForMs: undefined });
	const added: ObservedOutboundTrack[] = [];
	const removed: ObservedOutboundTrack[] = [];

	observer.on('outbound-track-added', ({ observedOutboundTrack }) => added.push(observedOutboundTrack));
	observer.on('outbound-track-removed', ({ observedOutboundTrack }) => removed.push(observedOutboundTrack));

	const track = () => observer.getObservedCall('call-1')!.getObservedClient('publisher')!
		.observedPeerConnections.get('pub-pc')!.observedOutboundTracks.get(TRACK_ID)!;

	return { observer, added, removed, track };
}

describe('outbound track republished on the same MediaStreamTrack', () => {
	it('gets a new object bound to the new media source and RTPs, while the old one is removed', () => {
		const { observer, added, removed, track } = setup();
		const p1: Publication = { mediaSourceId: 'ms-1', ssrc: 1, producerId: 'P1', packetsSent: 100 };

		observer.accept(publisherSample([ p1 ], p1));
		observer.accept(publisherSample([ { ...p1, packetsSent: 200 } ], p1));

		const first = track();

		expect(first.getMediaSource()?.id).toBe('ms-1');
		expect(first.getOutboundRtps()?.map((rtp) => rtp.ssrc)).toEqual([ 1 ]);

		// Republished: ms-2 / ssrc 2 / P2 appear; ms-1 / ssrc 1 stay reported, frozen.
		const p2: Publication = { mediaSourceId: 'ms-2', ssrc: 2, producerId: 'P2', packetsSent: 10 };

		observer.accept(publisherSample([ { ...p1, packetsSent: 200 }, p2 ], p2));
		observer.accept(publisherSample([ { ...p1, packetsSent: 200 }, { ...p2, packetsSent: 60 } ], p2));

		const second = track();

		expect(second).not.toBe(first);
		expect(second.id).toBe(TRACK_ID);
		expect(second.getMediaSource()?.id).toBe('ms-2');
		expect(second.getOutboundRtps()?.map((rtp) => rtp.ssrc)).toEqual([ 2 ]);
		expect(second.deltaPacketsSent).toBe(50);
		expect(added).toEqual([ first, second ]);
		expect(removed).toEqual([ first ]);

		// The old object keeps its own publication.
		expect(first.getMediaSource()?.id).toBe('ms-1');
		observer.close();
	});

	it('does not rotate while the media source stays the same, and includes RTPs that appear later', () => {
		const { observer, added, removed, track } = setup();
		const p1: Publication = { mediaSourceId: 'ms-1', ssrc: 1, producerId: 'P1', packetsSent: 100 };
		const layer: Publication = { mediaSourceId: 'ms-1', ssrc: 11, producerId: 'P1', packetsSent: 5 };

		observer.accept(publisherSample([ p1 ], p1));
		observer.accept(publisherSample([ p1, layer ], p1));

		expect(track().getOutboundRtps()?.map((rtp) => rtp.ssrc)).toEqual([ 1, 11 ]);
		expect(added).toHaveLength(1);
		expect(removed).toHaveLength(0);
		observer.close();
	});

	it('replaces the track object when its first media source appears after it', () => {
		const { observer, added, removed, track } = setup();
		const timestamp = nextTimestamp();

		observer.accept({
			timestamp, callId: 'call-1', clientId: 'publisher',
			peerConnections: [ { peerConnectionId: 'pub-pc', outboundTracks: [ { timestamp, id: TRACK_ID, kind: 'audio', attachments: { producerId: 'P1' } } ] } as unknown as PeerConnectionSample ],
		});

		const first = track();

		expect(first.getMediaSource()).toBeUndefined();

		const p1: Publication = { mediaSourceId: 'ms-1', ssrc: 1, producerId: 'P1', packetsSent: 100 };

		observer.accept(publisherSample([ p1 ], p1));

		expect(track()).not.toBe(first);
		expect(track().getMediaSource()?.id).toBe('ms-1');
		expect(added).toHaveLength(2);
		expect(removed).toEqual([ first ]);
		observer.close();
	});

	it('re-pairs consumers by producerId: P1 consumers unlink, P2 consumers link to the new object', () => {
		const { observer, track } = setup();
		const p1: Publication = { mediaSourceId: 'ms-1', ssrc: 1, producerId: 'P1', packetsSent: 100 };

		observer.accept(publisherSample([ p1 ], p1));
		observer.accept(consumerSample('P1'));

		const first = track();
		const call = observer.getObservedCall('call-1')!;
		const resolver = call.remoteTrackResolver!;

		expect(first.remoteInboundTracks.size).toBe(1);
		expect(resolver.getOutboundTrackByPublisherId('P1')).toBe(first);

		const p2: Publication = { mediaSourceId: 'ms-2', ssrc: 2, producerId: 'P2', packetsSent: 10 };

		observer.accept(publisherSample([ p1, p2 ], p2));

		const second = track();

		// The old producer's entry is released, even though the track's attachments now say P2.
		expect(resolver.getOutboundTrackByPublisherId('P1')).toBeUndefined();
		expect(resolver.getOutboundTrackByPublisherId('P2')).toBe(second);
		expect(first.remoteInboundTracks.size).toBe(0);

		observer.accept(consumerSample('P2'));
		expect(second.remoteInboundTracks.size).toBe(1);
		observer.close();
	});

	it('releases the publisher id the track was indexed under when it is removed, even if its producerId changed since', () => {
		const { observer, track } = setup();
		const p1: Publication = { mediaSourceId: 'ms-1', ssrc: 1, producerId: 'P1', packetsSent: 100 };

		observer.accept(publisherSample([ p1 ], p1));

		const resolver = observer.getObservedCall('call-1')!.remoteTrackResolver!;
		const first = track();

		expect(resolver.getOutboundTrackByPublisherId('P1')).toBe(first);

		// Same media source, but the attachments now report another producer.
		observer.accept(publisherSample([ p1 ], { ...p1, producerId: 'P-other' }));
		expect(track()).toBe(first);

		// The publisher stops reporting the track: it is removed, and the P1 entry with it.
		observer.accept({ timestamp: nextTimestamp(), callId: 'call-1', clientId: 'publisher', peerConnections: [ { peerConnectionId: 'pub-pc' } as unknown as PeerConnectionSample ] });
		expect(resolver.getOutboundTrackByPublisherId('P1')).toBeUndefined();
		observer.close();
	});
});
