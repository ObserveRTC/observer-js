import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

function peerConnectionOf(observer: Observer, clientId = 'client-1', pcId = 'pc-1') {
	return observer.getObservedCall('call-1')?.getObservedClient(clientId)?.observedPeerConnections.get(pcId);
}

describe('ObservedInboundRtp per-tick metrics', () => {
	it('derives bitrate and packet deltas across two samples', () => {
		const observer = new Observer();

		observer.accept(makeSample({
			timestamp: 1_000_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 1000, packetsReceived: 10, packetsLost: 1 } ] } ],
		}));
		observer.accept(makeSample({
			timestamp: 1_001_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 5000, packetsReceived: 50, packetsLost: 3 } ] } ],
		}));

		const rtp = peerConnectionOf(observer)?.observedInboundRtps.get(11);

		expect(rtp).toBeDefined();
		expect(rtp?.bitrate).toBe(32); // (5000-1000)*8 / 1000ms
		expect(rtp?.deltaReceivedPackets).toBe(40);
		expect(rtp?.deltaLostPackets).toBe(2);
		expect(rtp?.fractionLost).toBeCloseTo(2 / 42, 5);

		observer.close();
	});

	it('is counter-reset-safe: a decreasing counter yields a zero delta, never negative', () => {
		const observer = new Observer();

		observer.accept(makeSample({
			timestamp: 2_000_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 5000, packetsReceived: 50, packetsLost: 5 } ] } ],
		}));
		observer.accept(makeSample({
			timestamp: 2_001_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 1000, packetsReceived: 10, packetsLost: 1 } ] } ],
		}));

		const rtp = peerConnectionOf(observer)?.observedInboundRtps.get(11);

		expect(rtp?.bitrate).toBe(0);
		expect(rtp?.deltaReceivedPackets).toBe(0);
		expect(rtp?.deltaLostPackets).toBe(0);

		observer.close();
	});
});

describe('Remote-RTP correlation', () => {
	it('surfaces receiver-report metrics on the local outbound-rtp', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ {
				peerConnectionId: 'pc-1',
				outbound: [ { trackId: 'o', kind: 'video', ssrc: 200, bytesSent: 1000 } ],
				remoteInbound: [ { ssrc: 200, kind: 'video', roundTripTime: 0.05, fractionLost: 0.1, jitter: 0.02, packetsLost: 7 } ],
			} ],
		});

		observer.accept(sample(3_000_000));
		observer.accept(sample(3_001_000));

		const out = peerConnectionOf(observer)?.observedOutboundRtps.get(200);

		expect(out).toBeDefined();
		expect(out?.remoteRttInMs).toBe(50); // 0.05s * 1000
		expect(out?.remoteFractionLost).toBe(0.1);
		expect(out?.remoteJitter).toBe(0.02);
		expect(out?.remotePacketsLost).toBe(7);

		observer.close();
	});

	it('surfaces sender-report metrics on the local inbound-rtp', () => {
		const observer = new Observer();
		const sample = (timestamp: number) => makeSample({
			timestamp,
			peerConnections: [ {
				peerConnectionId: 'pc-1',
				inbound: [ { trackId: 'i', kind: 'video', ssrc: 300, bytesReceived: 1000, packetsReceived: 10 } ],
				remoteOutbound: [ { ssrc: 300, kind: 'video', roundTripTime: 0.03, bytesSent: 9999, packetsSent: 20 } ],
			} ],
		});

		observer.accept(sample(4_000_000));
		observer.accept(sample(4_001_000));

		const inb = peerConnectionOf(observer)?.observedInboundRtps.get(300);

		expect(inb).toBeDefined();
		expect(inb?.remoteRttInMs).toBe(30);
		expect(inb?.remoteBytesSent).toBe(9999);
		expect(inb?.remotePacketsSent).toBe(20);

		observer.close();
	});
});
