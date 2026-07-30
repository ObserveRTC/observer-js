import { Observer } from '../src/Observer';
import {
	createDefaultMediasoupRemoteTrackResolverFactory,
	createP2pRemoteTrackResolverFactory,
} from '../src/utils/RemoteTrackResolverFactories';
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
