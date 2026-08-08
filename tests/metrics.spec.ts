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
		// bits per second — (5000-1000) bytes * 8 / 1s. (This used to assert 32, i.e. bits-per-ms,
		// which disagreed with ObservedOutboundRtp.bitrate and the client-level bitrates.)
		expect(rtp?.bitrate).toBe(32_000);
		expect(rtp?.deltaBytesReceived).toBe(4000);
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

	// Regression: the previous guards were truthiness-based (`this.packetsLost && ...`), so a
	// previous value of 0 disabled the delta — the FIRST loss/freeze burst of every stream was
	// silently dropped and fractionLost stayed undefined.
	it('counts the first increment from a zero baseline', () => {
		const observer = new Observer();

		observer.accept(makeSample({
			timestamp: 4_000_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 0, packetsReceived: 0, packetsLost: 0, freezeCount: 0, pliCount: 0 } ] } ],
		}));
		observer.accept(makeSample({
			timestamp: 4_001_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 4000, packetsReceived: 90, packetsLost: 10, freezeCount: 2, pliCount: 5 } ] } ],
		}));

		const rtp = peerConnectionOf(observer)?.observedInboundRtps.get(11);

		expect(rtp?.deltaLostPackets).toBe(10);
		expect(rtp?.deltaReceivedPackets).toBe(90);
		expect(rtp?.deltaFreezeCount).toBe(2);
		expect(rtp?.deltaPliCount).toBe(5);
		expect(rtp?.fractionLost).toBeCloseTo(0.1, 5);

		observer.close();
	});

	it('reports fractionLost as 0 (not undefined) when there is traffic but no loss', () => {
		const observer = new Observer();

		observer.accept(makeSample({
			timestamp: 5_000_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 1000, packetsReceived: 10, packetsLost: 0 } ] } ],
		}));
		observer.accept(makeSample({
			timestamp: 5_001_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 5000, packetsReceived: 50, packetsLost: 0 } ] } ],
		}));

		expect(peerConnectionOf(observer)?.observedInboundRtps.get(11)?.fractionLost).toBe(0);

		observer.close();
	});

	// Regression: `jitter` was reset to undefined on every update and never assigned from the sample.
	it('surfaces jitter, and derives jitter-buffer / concealment / frames-dropped ratios', () => {
		const observer = new Observer();

		observer.accept(makeSample({
			timestamp: 6_000_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 1000, packetsReceived: 10, jitter: 0.01, jitterBufferDelay: 1, jitterBufferEmittedCount: 100, concealedSamples: 0, totalSamplesReceived: 1000, framesReceived: 10, framesDropped: 0 } ] } ],
		}));
		observer.accept(makeSample({
			timestamp: 6_001_000,
			peerConnections: [ { peerConnectionId: 'pc-1', inbound: [ { trackId: 'a', ssrc: 11, bytesReceived: 5000, packetsReceived: 50, jitter: 0.03, jitterBufferDelay: 3, jitterBufferEmittedCount: 150, concealedSamples: 100, totalSamplesReceived: 2000, framesReceived: 30, framesDropped: 4 } ] } ],
		}));

		const rtp = peerConnectionOf(observer)?.observedInboundRtps.get(11);

		expect(rtp?.jitter).toBe(0.03);
		// (3-1)s over (150-100) emitted = 40ms mean
		expect(rtp?.jitterBufferDelayInMs).toBeCloseTo(40);
		expect(rtp?.concealmentRatio).toBeCloseTo(100 / 1000);
		expect(rtp?.framesDroppedRatio).toBeCloseTo(4 / 20);

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
