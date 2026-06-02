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
				ice: { localProtocol: 'tcp', localCandidateType: 'relay', remoteUrl: 'turn:turn.example.org:3478', bytesReceived: 1000, bytesSent: 2000 },
			} ],
		});

		observer.accept(sample(1000));
		observer.accept(sample(2000));

		const pc = peerConnectionOf(observer);

		expect(pc?.usingTCP).toBe(true);
		expect(pc?.usingTURN).toBe(true);

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
