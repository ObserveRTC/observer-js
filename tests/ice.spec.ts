import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

function peerConnectionOf(observer: Observer) {
	return observer.getObservedCall('call-1')?.getObservedClient('client-1')?.observedPeerConnections.get('pc-1');
}

describe('ICE-derived flags (usingTURN / usingTCP)', () => {
	it('detects TURN + TCP from the selected candidate pair', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ {
				peerConnectionId: 'pc-1',
				ice: { localProtocol: 'tcp', localCandidateType: 'relay', localUrl: 'turn:turn.example.org:3478?transport=tcp', bytesReceived: 1000, bytesSent: 2000 },
			} ],
		});

		observer.accept(sample(1000));
		observer.accept(sample(2000));

		const pc = peerConnectionOf(observer);

		expect(pc?.usingTCP).toBe(true);
		expect(pc?.usingTURN).toBe(true);

		observer.close();
	});

	// A relay local candidate is by definition obtained from a TURN server, so `usingTURN` must not
	// depend on the `url` being reported (not every browser exposes it).
	it('detects TURN from a relay local candidate even without a url', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ { peerConnectionId: 'pc-1', ice: { localProtocol: 'udp', localCandidateType: 'relay' } } ],
		});

		observer.accept(sample(1000));
		observer.accept(sample(2000));

		expect(peerConnectionOf(observer)?.usingTURN).toBe(true);

		observer.close();
	});

	// Regression: detection used to read the url off the *remote* candidate, which per W3C
	// webrtc-stats never carries one — so TURN was effectively never attributed.
	it('does not treat a url on the remote candidate as TURN usage', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ { peerConnectionId: 'pc-1', ice: { localCandidateType: 'host', remoteUrl: 'turn:turn.example.org:3478' } } ],
		});

		observer.accept(sample(1000));
		observer.accept(sample(2000));

		expect(peerConnectionOf(observer)?.usingTURN).toBe(false);

		observer.close();
	});

	it('registers the TURN server, keyed by the url without its transport query', () => {
		const observer = new Observer();
		const sample = (timestamp: number, clientId: string) => makeSample({
			clientId,
			timestamp,
			peerConnections: [ {
				peerConnectionId: `pc-${clientId}`,
				// `turns:` (TURN over TLS) must match too, and the `?transport=` query must not
				// fragment the server key. (`new URL()` parses turn: as an opaque path — empty
				// hostname/port — which is why the key is derived by stripping the query instead.)
				ice: { localCandidateType: 'relay', localUrl: 'turns:turn.example.org:5349?transport=tcp', bytesReceived: 1000, bytesSent: 2000 },
			} ],
		});

		observer.accept(sample(1000, 'client-1'));
		observer.accept(sample(2000, 'client-1'));
		observer.accept(sample(1000, 'client-2'));
		observer.accept(sample(2000, 'client-2'));

		const servers = observer.observedTURN.servers;

		// Both peer connections attribute to the SAME server entry (previously the created server
		// was never stored in `servers`, so this map stayed empty).
		expect([ ...servers.keys() ]).toEqual([ 'turns:turn.example.org:5349' ]);
		expect(servers.get('turns:turn.example.org:5349')?.observedPeerConnections.size).toBe(2);

		observer.close();
	});

	it('reports no TURN/TCP for a plain host/udp pair', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ { peerConnectionId: 'pc-1', ice: { localProtocol: 'udp', localCandidateType: 'host' } } ],
		});

		observer.accept(sample(1000));
		observer.accept(sample(2000));

		const pc = peerConnectionOf(observer);

		expect(pc?.usingTCP).toBe(false);
		expect(pc?.usingTURN).toBe(false);

		observer.close();
	});
});
