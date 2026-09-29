import { Observer } from '../src/Observer';
import type { ClientSample, PeerConnectionSample } from '../src/schema/ClientSample';
import { makeSample, nextTimestamp } from './helpers/samples';

function withCertificate(present: boolean): ClientSample {
	const timestamp = nextTimestamp();

	return {
		timestamp,
		callId: 'call-1',
		clientId: 'client-1',
		peerConnections: [ {
			peerConnectionId: 'pc-1',
			certificates: present ? [ { timestamp, id: 'cert-1', fingerprint: 'AA:BB', fingerprintAlgorithm: 'sha-256', base64Certificate: 'x' } ] : [],
		} as PeerConnectionSample ],
	};
}

describe('event firing', () => {
	it('certificate-updated fires on every tick (first included) and certificate-removed when it goes stale', () => {
		const observer = new Observer();
		const events: string[] = [];

		observer.on('certificate-added', () => events.push('added'));
		observer.on('certificate-updated', () => events.push('updated'));
		observer.on('certificate-removed', () => events.push('removed'));

		observer.accept(withCertificate(true));
		observer.accept(withCertificate(true));
		observer.accept(withCertificate(false));

		expect(events).toEqual([ 'added', 'updated', 'updated', 'removed' ]);

		observer.close();
	});

	it('announces a client event deferred to its peer connection exactly once', () => {
		const observer = new Observer();
		const types: string[] = [];

		observer.on('client-event', ({ event }) => types.push(event.type));
		observer.accept(makeSample({
			clientEvents: [ { type: 'PEER_CONNECTION_OPENED', payload: { peerConnectionId: 'pc-1' } } ],
			peerConnections: [ { peerConnectionId: 'pc-1' } ],
		}));

		expect(types).toEqual([ 'PEER_CONNECTION_OPENED' ]);
		expect(observer.getObservedCall('call-1')?.getObservedClient('client-1')?.observedPeerConnections.get('pc-1')?.openedAt).toBeDefined();

		observer.close();
	});

	it('emits outbound-track-muted for a track that arrives in the same sample as the event', () => {
		const observer = new Observer();
		const muted: string[] = [];

		observer.on('outbound-track-muted', ({ observedOutboundTrack }) => muted.push(observedOutboundTrack.id));
		// the peer connection exists already, the track does not
		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));
		observer.accept(makeSample({
			clientEvents: [ { type: 'MEDIA_TRACK_MUTED', payload: { peerConnectionId: 'pc-1', trackId: 'track-1' } } ],
			peerConnections: [ { peerConnectionId: 'pc-1', outbound: [ { trackId: 'track-1' } ] } ],
		}));

		expect(muted).toEqual([ 'track-1' ]);

		observer.close();
	});

	it('closes the peer connection (peer-connection-closed) when the client reports PEER_CONNECTION_CLOSED', () => {
		const observer = new Observer();
		const events: string[] = [];

		observer.on('peer-connection-added', () => events.push('added'));
		observer.on('peer-connection-closed', ({ observedPeerConnection }) => events.push(`closed@${observedPeerConnection.closedAt}`));

		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));
		// the final stats and the close event arrive together
		observer.accept(makeSample({
			clientEvents: [ { type: 'PEER_CONNECTION_CLOSED', timestamp: 4242, payload: { peerConnectionId: 'pc-1' } } ],
			peerConnections: [ { peerConnectionId: 'pc-1' } ],
		}));
		// late stats do not resurrect it
		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

		expect(events).toEqual([ 'added', 'closed@4242' ]);
		expect(client?.observedPeerConnections.size).toBe(0);

		observer.close();
	});

	it('closes the peer connection immediately for an injected PEER_CONNECTION_CLOSED between samples', () => {
		const observer = new Observer();
		let closed = 0;

		observer.on('peer-connection-closed', () => ++closed);
		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

		client?.injectEvent({ type: 'PEER_CONNECTION_CLOSED', timestamp: nextTimestamp(), payload: { peerConnectionId: 'pc-1' } });
		// injected between samples: buffered until the next accept
		observer.accept(makeSample({}));

		expect(closed).toBe(1);

		observer.close();
	});

	it('does not emit call-empty (nor arm the empty timer) while the call itself is closing', () => {
		const observer = new Observer({ closeCallIfEmptyForMs: 60_000 });
		let empty = 0;

		observer.on('call-empty', () => ++empty);
		observer.accept(makeSample({}));
		observer.getObservedCall('call-1')?.close();

		expect(empty).toBe(0);

		observer.close();
	});

	it('does not emit client-extension-stats after the client closed', () => {
		const observer = new Observer();
		let fired = 0;

		observer.on('client-extension-stats', () => ++fired);
		observer.accept(makeSample({}));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

		client?.close();
		client?.addExtensionStats({ type: 'x', payload: {} } as never);

		expect(fired).toBe(0);

		observer.close();
	});

	it('resets per-tick data-channel message deltas', () => {
		const observer = new Observer();
		const dc = (messagesSent: number): ClientSample => {
			const timestamp = nextTimestamp();

			return {
				timestamp,
				callId: 'call-1',
				clientId: 'client-1',
				peerConnections: [ {
					peerConnectionId: 'pc-1',
					dataChannels: [ { timestamp, id: 'dc-1', messagesSent, bytesSent: 0, messagesReceived: 0, bytesReceived: 0 } ],
				} as unknown as PeerConnectionSample ],
			};
		};

		observer.accept(dc(10));
		observer.accept(dc(15));
		observer.accept(dc(15));

		expect(observer.getObservedCall('call-1')?.getObservedClient('client-1')?.observedPeerConnections.get('pc-1')?.deltaDataChannelMessagesSent).toBe(0);

		observer.close();
	});
});
