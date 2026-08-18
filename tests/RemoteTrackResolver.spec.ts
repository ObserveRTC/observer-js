import { Observer } from '../src/Observer';
import {
	createDefaultMediasoupRemoteTrackResolverFactory,
	createP2pRemoteTrackResolverFactory,
} from '../src/resolvers/RemoteTrackResolverFactories';
import { makeSample } from './helpers/samples';

function inboundTrackOf(observer: Observer, clientId: string, pcId: string, trackId: string) {
	return observer.getObservedCall('call-1')
		?.getObservedClient(clientId)
		?.observedPeerConnections.get(pcId)
		?.observedInboundTracks.get(trackId);
}

function outboundTrackOf(observer: Observer, clientId: string, pcId: string, trackId: string) {
	return observer.getObservedCall('call-1')
		?.getObservedClient(clientId)
		?.observedPeerConnections.get(pcId)
		?.observedOutboundTracks.get(trackId);
}

describe('RemoteTrackResolver (mediasoup factory)', () => {
	it('links a publisher (outbound) to its subscribers (inbound) by producerId, publisher first', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', attachments: { producerId: 'P' } } ] } ],
		}));
		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video', attachments: { producerId: 'P', consumerId: 'C' } } ] } ],
		}));

		const out = outboundTrackOf(observer, 'A', 'pcA', 'tA');
		const inb = inboundTrackOf(observer, 'B', 'pcB', 'tB');

		expect(out).toBeDefined();
		expect(inb).toBeDefined();
		expect(inb?.remoteOutboundTrack).toBe(out);
		expect(out?.remoteInboundTracks.has(inb!)).toBe(true);

		observer.close();
	});

	it('links when the subscriber arrives before the publisher', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video', attachments: { producerId: 'P', consumerId: 'C' } } ] } ],
		}));
		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', attachments: { producerId: 'P' } } ] } ],
		}));

		const out = outboundTrackOf(observer, 'A', 'pcA', 'tA');
		const inb = inboundTrackOf(observer, 'B', 'pcB', 'tB');

		expect(inb?.remoteOutboundTrack).toBe(out);
		expect(out?.remoteInboundTracks.has(inb!)).toBe(true);

		observer.close();
	});

	it('does not link tracks with different producer ids', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', attachments: { producerId: 'P1' } } ] } ],
		}));
		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video', attachments: { producerId: 'P2', consumerId: 'C' } } ] } ],
		}));

		expect(inboundTrackOf(observer, 'B', 'pcB', 'tB')?.remoteOutboundTrack).toBeUndefined();
		expect(outboundTrackOf(observer, 'A', 'pcA', 'tA')?.remoteInboundTracks.size).toBe(0);

		observer.close();
	});

});

describe('RemoteTrackResolver (p2p factory)', () => {
	it('links a publisher to a subscriber by shared SSRC', () => {
		const observer = new Observer({ createRemoteTrackResolver: createP2pRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', ssrc: 5000 } ] } ],
		}));
		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video', ssrc: 5000 } ] } ],
		}));

		const out = outboundTrackOf(observer, 'A', 'pcA', 'tA');
		const inb = inboundTrackOf(observer, 'B', 'pcB', 'tB');

		expect(out).toBeDefined();
		expect(inb?.remoteOutboundTrack).toBe(out);
		expect(out?.remoteInboundTracks.has(inb!)).toBe(true);

		observer.close();
	});
});

describe('RemoteTrackResolver (a publisher id that arrives late)', () => {
	// The bug this guards: resolution used to happen only on `*-track-added`, which fires once. A
	// strategy that could not produce a key at that instant lost the track for its entire life, even
	// though `attachments` are replaced on every sample. Racy by construction for any strategy backed
	// by an application's own mapping.
	it('links a subscriber whose producerId only appears on a later sample', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', attachments: { producerId: 'P' } } ] } ],
		}));

		// First sample for the subscriber carries no producerId at all.
		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video' } ] } ],
		}));

		const out = outboundTrackOf(observer, 'A', 'pcA', 'tA');
		const inb = inboundTrackOf(observer, 'B', 'pcB', 'tB');

		expect(inb?.remoteOutboundTrack).toBeUndefined();
		expect(observer.getObservedCall('call-1')?.remoteTrackResolver?.pendingTrackCounts.inbound).toBe(1);

		// Second sample for the same track brings it.
		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video', attachments: { producerId: 'P', consumerId: 'C' } } ] } ],
		}));

		expect(inb?.remoteOutboundTrack).toBe(out);
		expect(out?.remoteInboundTracks.has(inb!)).toBe(true);
		expect(observer.getObservedCall('call-1')?.remoteTrackResolver?.pendingTrackCounts.inbound).toBe(0);
		// It has a subscriber now, so it must have left the "published to nobody" set.
		expect(observer.getObservedCall('call-1')?.unconsumedOutboundTracks.has(out!)).toBe(false);

		observer.close();
	});

	// The outbound case is worse than a missing link: an unresolvable publisher never reached
	// `unconsumedOutboundTracks` either, so `UnconsumedTrackDetector` could not see it at all.
	it('registers a publisher whose producerId only appears on a later sample', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video' } ] } ],
		}));

		const call = observer.getObservedCall('call-1')!;
		const out = outboundTrackOf(observer, 'A', 'pcA', 'tA');

		expect(call.remoteTrackResolver?.pendingTrackCounts.outbound).toBe(1);
		expect(call.unconsumedOutboundTracks.has(out!)).toBe(false);

		observer.accept(makeSample({
			clientId: 'A',
			peerConnections: [ { peerConnectionId: 'pcA', outbound: [ { trackId: 'tA', kind: 'video', attachments: { producerId: 'P' } } ] } ],
		}));

		expect(call.remoteTrackResolver?.pendingTrackCounts.outbound).toBe(0);
		expect(call.remoteTrackResolver?.getOutboundTrackByPublisherId('P')).toBe(out);
		// Now visible as a publisher with no subscribers, which is what it actually is.
		expect(call.unconsumedOutboundTracks.has(out!)).toBe(true);

		observer.close();
	});

	// A key that never arrives must not turn into an ever-growing retry list.
	it('drops a never-resolved track from the pending set when it goes away', () => {
		const observer = new Observer({ createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() });

		observer.accept(makeSample({
			clientId: 'B',
			peerConnections: [ { peerConnectionId: 'pcB', inbound: [ { trackId: 'tB', kind: 'video' } ] } ],
		}));

		const call = observer.getObservedCall('call-1')!;

		expect(call.remoteTrackResolver?.pendingTrackCounts.inbound).toBe(1);

		// A sample without the track retires it.
		observer.accept(makeSample({ clientId: 'B', peerConnections: [ { peerConnectionId: 'pcB' } ] }));

		expect(call.remoteTrackResolver?.pendingTrackCounts.inbound).toBe(0);

		observer.close();
	});
});
