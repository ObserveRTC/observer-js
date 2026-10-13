import { Observer } from '../src/Observer';
import { RTT_HISTOGRAM_NUMBER_OF_BUCKETS, SCORE_HISTOGRAM_NUMBER_OF_BUCKETS } from '../src/ObservedClient';
import { percentileOfHistogram } from '../src/utils/stats';
import { makeSample, PeerConnectionSpec } from './helpers/samples';

function clientOf(observer: Observer) {
	return observer.getObservedCall('call-1')?.getObservedClient('client-1');
}

/** A peer connection whose RTCP RTT is `rttInMs` and whose single inbound stream has the given cumulative counters. */
function pc(peerConnectionId: string, rttInMs: number, received: number, lost: number, ice?: PeerConnectionSpec['ice']): PeerConnectionSpec {
	return {
		peerConnectionId,
		inbound: [ { trackId: `${peerConnectionId}-in`, ssrc: 1, packetsReceived: received, packetsLost: lost } ],
		outbound: [ { trackId: `${peerConnectionId}-out`, ssrc: 2 } ],
		remoteInbound: [ { ssrc: 2, roundTripTime: rttInMs / 1000 } ],
		ice,
	};
}

describe('ObservedClient session totals', () => {
	it('accumulates RTT measurements over the whole session', () => {
		const observer = new Observer();

		for (const rtt of [ 20, 100, 200, 400 ]) {
			observer.accept(makeSample({ peerConnections: [ pc('pc-1', rtt, 0, 0) ] }));
		}

		const client = clientOf(observer)!;

		expect(client.numberOfRttMeasurements).toBe(4);
		expect(client.totalRttSumInMs).toBeCloseTo(720);
		expect(client.minRttInMs).toBeCloseTo(20);
		expect(client.maxRttInMs).toBeCloseTo(400);
		expect(client.rttHistogram).toHaveLength(RTT_HISTOGRAM_NUMBER_OF_BUCKETS);
		expect(client.rttHistogram.reduce((a, b) => a + b, 0)).toBe(4);
		expect(client.rttHistogram[1]).toBe(1); // 20 ms
		expect(client.rttHistogram[5]).toBe(1); // 100 ms
		expect(client.rttHistogram[10]).toBe(1); // 200 ms
		expect(client.rttHistogram[20]).toBe(1); // 400 ms
		expect(client.rttSummary.avg).toBeCloseTo(180);
	});

	it('estimates RTT percentiles from the histogram within one bucket width', () => {
		const observer = new Observer();
		const rtts = Array.from({ length: 100 }, (_, i) => (i + 1) * 5); // 5..500 ms

		for (const rtt of rtts) {
			observer.accept(makeSample({ peerConnections: [ pc('pc-1', rtt, 0, 0) ] }));
		}

		const { p50, p75, p95, p99, avg } = clientOf(observer)!.rttSummary;

		expect(Math.abs(p50! - 250)).toBeLessThanOrEqual(20);
		expect(Math.abs(p75! - 375)).toBeLessThanOrEqual(20);
		expect(Math.abs(p95! - 475)).toBeLessThanOrEqual(20);
		expect(Math.abs(p99! - 495)).toBeLessThanOrEqual(20);
		expect(p99!).toBeLessThanOrEqual(500);
		expect(avg).toBeCloseTo(252.5);
	});

	it('reports overflow-bucket percentiles as the max RTT and nothing before the first measurement', () => {
		const observer = new Observer();

		observer.accept(makeSample({ peerConnections: [] }));
		expect(clientOf(observer)!.rttSummary).toEqual({ p50: undefined, p75: undefined, p95: undefined, p99: undefined, avg: undefined });

		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 1500, 0, 0) ] }));
		expect(clientOf(observer)!.rttSummary.p95).toBeCloseTo(1500);
	});

	it('caches the RTT percentiles until the next measurement and returns a frozen object', () => {
		const observer = new Observer();

		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 100, 0, 0) ] }));

		const client = clientOf(observer)!;
		const first = client.rttSummary;

		expect(client.rttSummary).toBe(first);
		expect(Object.isFrozen(first)).toBe(true);

		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 300, 0, 0) ] }));
		expect(client.rttSummary).not.toBe(first);
		expect(client.rttSummary.avg).toBeCloseTo(200);
	});

	it('builds the score distribution, including scores of 0', () => {
		const observer = new Observer();
		const scores = [ 0, 1.5, 2.5, 3.5, 4.2, 4.4, 4.6, 4.8, 5, 5 ];

		for (const score of scores) observer.accept({ ...makeSample(), score });
		observer.accept(makeSample()); // no score: not counted

		const client = clientOf(observer)!;
		const { p5, p25, p50, p75, p95, avg } = client.scoreSummary;

		expect(client.scoreHistogram).toHaveLength(SCORE_HISTOGRAM_NUMBER_OF_BUCKETS);
		expect(client.scoreHistogram).toEqual([ 1, 1, 1, 1, 6 ]);
		expect(client.numberOfScoreMeasurements).toBe(10);
		expect(client.minScore).toBe(0);
		expect(client.maxScore).toBe(5);
		expect(avg).toBeCloseTo(35.5 / 10);
		expect(p5!).toBeGreaterThanOrEqual(0);
		expect(p5!).toBeLessThanOrEqual(1);
		expect(p25!).toBeGreaterThanOrEqual(2);
		expect(p25!).toBeLessThanOrEqual(3);
		expect(p50!).toBeGreaterThanOrEqual(4);
		expect([ p50!, p75!, p95! ].every((v, i, a) => i === 0 || a[i - 1] <= v)).toBe(true);
		expect(p95!).toBeLessThanOrEqual(5);
	});

	it('percentileOfHistogram lets histograms of several clients be combined', () => {
		const a = [ 2, 0, 0 ];
		const b = [ 0, 0, 2 ];
		const combined = a.map((count, i) => count + b[i]);

		expect(percentileOfHistogram(combined, 10, 0.5)).toBeCloseTo(10);
		expect(percentileOfHistogram([ 0, 0, 0 ], 10, 0.5)).toBeUndefined();
	});

	it('keeps packet totals after a peer connection is closed', () => {
		const observer = new Observer();

		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 100, 0) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 300, 10) ] }));
		observer.accept(makeSample({
			clientEvents: [ { type: 'PEER_CONNECTION_CLOSED', payload: { peerConnectionId: 'pc-1' } } ],
			peerConnections: [],
		}));
		observer.accept(makeSample({ peerConnections: [ pc('pc-2', 50, 50, 0) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-2', 50, 150, 5) ] }));

		const client = clientOf(observer)!;

		expect(client.observedPeerConnections.has('pc-1')).toBe(false);
		// The first sample of a peer connection is its baseline, so only the deltas after it count:
		// pc-1 adds 200 received / 10 lost, pc-2 adds 100 received / 5 lost.
		expect(client.totalInboundPacketsReceived).toBe(300);
		expect(client.totalInboundPacketsLost).toBe(15);
	});

	it('counts samples by transport path, including a switch from UDP to TURN over TCP', () => {
		const observer = new Observer();

		observer.accept(makeSample({ peerConnections: [] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 0, 0, { localProtocol: 'udp', localCandidateType: 'srflx' }) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 0, 0, { localProtocol: 'udp', localCandidateType: 'srflx' }) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 0, 0, { localProtocol: 'udp', localCandidateType: 'relay', localRelayProtocol: 'tcp' }) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 0, 0, { localProtocol: 'tcp', localCandidateType: 'host' }) ] }));
		observer.accept(makeSample({ peerConnections: [ pc('pc-1', 50, 0, 0, { localProtocol: 'udp', localCandidateType: 'relay', localRelayProtocol: 'udp' }) ] }));

		const client = clientOf(observer)!;

		expect(client.numberOfSamplesWithUnknownPath).toBe(1);
		expect(client.numberOfSamplesOverUdp).toBe(2);
		expect(client.numberOfSamplesOverTurnTcp).toBe(1);
		expect(client.numberOfSamplesOverTcp).toBe(1);
		expect(client.numberOfSamplesOverTurnUdp).toBe(1);
	});

	it('counts issues over the session by type, once per open interval of a keyed issue', () => {
		const observer = new Observer();

		observer.accept({ ...makeSample(), clientIssues: [ { type: 'a', timestamp: 1 }, { type: 'b', timestamp: 2 } ] });
		observer.accept({ ...makeSample(), clientIssues: [ { type: 'a', timestamp: 3 }, { type: 'stateful', key: 'k1', timestamp: 3 } ] });
		// re-raised while open: not counted again
		observer.accept({ ...makeSample(), clientIssues: [ { type: 'stateful', key: 'k1', timestamp: 4 } ] });
		// resolved: the resolution itself is not counted
		observer.accept({ ...makeSample(), clientIssues: [ { type: 'stateful-resolved', key: 'k1', timestamp: 5 } ] });
		// raised again after resolution: a new interval
		observer.accept({ ...makeSample(), clientIssues: [ { type: 'stateful', key: 'k1', timestamp: 6 } ] });

		const client = clientOf(observer)!;

		expect(client.issueHistogram.a).toBe(2);
		expect(client.issueHistogram.b).toBe(1);
		expect(client.issueHistogram.stateful).toBe(2);
		expect(client.issueHistogram['stateful-resolved']).toBeUndefined();
		expect(client.issueHistogram.never).toBeUndefined();
		expect(client.totalNumberOfIssues).toBe(5);
	});
});
