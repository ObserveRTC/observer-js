import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/utils/RemoteTrackResolverFactories';
import { TrackDistributionAggregator } from '../src/utils/TrackDistributionAggregator';
import { CommonSourceDegradationDetector, CommonSourceDegradationTypes } from '../src/detectors/CommonSourceDegradationDetector';
import { makeSample, type InboundSpec } from './helpers/samples';

const PRODUCER = 'P';

/** Publisher A sends one video track; receivers subscribe to it via the same producerId. */
function publisherSample(timestamp: number, bytesSent: number, packetsSent: number) {
	return makeSample({
		clientId: 'A',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pcA',
			outbound: [ { trackId: 'tA', kind: 'video', ssrc: 1, bytesSent, packetsSent, attachments: { producerId: PRODUCER } } ],
		} ],
	});
}

function receiverSample(clientId: string, timestamp: number, inbound: Partial<InboundSpec>) {
	return makeSample({
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc${clientId}`,
			inbound: [ {
				trackId: `t${clientId}`,
				kind: 'video',
				ssrc: 1,
				attachments: { producerId: PRODUCER, consumerId: `c${clientId}` },
				...inbound,
			} as InboundSpec ],
		} ],
	});
}

function setup() {
	const observer = new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		updatePolicy: 'none',
		defaultCallUpdatePolicy: 'none',
	});

	return observer;
}

function outboundTrack(observer: Observer) {
	return observer.getObservedCall('call-1')
		?.getObservedClient('A')
		?.observedPeerConnections.get('pcA')
		?.observedOutboundTracks.get('tA');
}

describe('TrackDistributionAggregator', () => {
	it('aggregates a publisher against its subscribers and flags only the degraded one', () => {
		const observer = setup();

		// tick 1 — establish baselines for every counter
		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, framesReceived: 30, framesDropped: 0, freezeCount: 0 }));
		}

		// tick 2 — B and C healthy, D loses 10% of packets and freezes
		observer.accept(publisherSample(2000, 300_000, 300));
		observer.accept(receiverSample('B', 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, framesReceived: 60, framesDropped: 0, freezeCount: 0 }));
		observer.accept(receiverSample('C', 2000, { bytesReceived: 298_000, packetsReceived: 298, packetsLost: 1, framesReceived: 60, framesDropped: 0, freezeCount: 0 }));
		observer.accept(receiverSample('D', 2000, { bytesReceived: 120_000, packetsReceived: 180, packetsLost: 20, framesReceived: 38, framesDropped: 6, freezeCount: 3 }));

		const call = observer.getObservedCall('call-1')!;
		const aggregator = new TrackDistributionAggregator(call);
		const distributions = aggregator.aggregate();

		expect(distributions).toHaveLength(1);

		const d = distributions[0];

		expect(d.trackId).toBe('tA');
		expect(d.numberOfReceivers).toBe(3);
		expect(d.numberOfDegradedReceivers).toBe(1);
		expect(d.numberOfHealthyReceivers).toBe(2);
		expect(d.degradedRatio).toBeCloseTo(1 / 3);

		const degraded = d.receivers.find((r) => r.degraded)!;

		expect(degraded.clientId).toBe('D');
		expect(degraded.reasons).toEqual(expect.arrayContaining([ 'fraction-lost', 'freezes' ]));

		// fan-out counters + distribution summaries
		expect(d.freezes).toEqual({ affectedReceivers: 1, total: 3 });
		expect(d.fractionLost?.count).toBe(3);
		expect(d.fractionLost?.max).toBeGreaterThan(0.09);
		expect(d.bitrate?.count).toBe(3);

		observer.close();
	});

	it('returns nothing when no RemoteTrackResolver links the tracks', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });

		observer.accept(publisherSample(1000, 100_000, 100));
		observer.accept(receiverSample('B', 1000, { bytesReceived: 100_000, packetsReceived: 100 }));

		const call = observer.getObservedCall('call-1')!;

		expect(new TrackDistributionAggregator(call).aggregate()).toHaveLength(0);
		expect(outboundTrack(observer)?.remoteInboundTracks.size).toBe(0);

		observer.close();
	});
});

describe('CommonSourceDegradationDetector', () => {
	it('raises PUBLISHER_HEALTHY_SUBSCRIBERS_DEGRADED when the source is fine but most receivers are not', () => {
		const observer = setup();
		const issues: { type: string, payload?: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
		}

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CommonSourceDegradationDetector(call, { consecutiveTicks: 1 }));

		// publisher healthy (packets keep flowing, no remote loss), all three receivers lossy
		observer.accept(publisherSample(2000, 300_000, 300));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 2000, { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 30, freezeCount: 2 }));
		}
		call.update();

		expect(issues).toHaveLength(1);
		expect(issues[0].type).toBe(CommonSourceDegradationTypes.publisherHealthySubscribersDegraded);

		const payload = JSON.parse(issues[0].payload!);

		expect(payload.receivers).toBe(3);
		expect(payload.degradedReceivers).toBe(3);
		expect(payload.degradedRatio).toBe(1);
		expect(payload.affectedClientIds.sort()).toEqual([ 'B', 'C', 'D' ]);
		expect(payload.publisher.healthy).toBe(true);

		observer.close();
	});

	it('raises SINGLE_SUBSCRIBER_DEGRADED when only one receiver suffers', () => {
		const observer = setup();
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
		}

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CommonSourceDegradationDetector(call, { consecutiveTicks: 1 }));

		observer.accept(publisherSample(2000, 300_000, 300));
		observer.accept(receiverSample('B', 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 }));
		observer.accept(receiverSample('C', 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 }));
		observer.accept(receiverSample('D', 2000, { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 30, freezeCount: 2 }));
		call.update();

		expect(issues.map((i) => i.type)).toEqual([ CommonSourceDegradationTypes.singleSubscriberDegraded ]);

		observer.close();
	});

	it('stays silent while healthy, and requires consecutive ticks before raising', () => {
		const observer = setup();
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
		}

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CommonSourceDegradationDetector(call, { consecutiveTicks: 2 }));

		// healthy tick → nothing
		observer.accept(publisherSample(2000, 300_000, 300));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 }));
		}
		call.update();
		expect(issues).toHaveLength(0);

		// first bad tick → still nothing (streak = 1)
		observer.accept(publisherSample(3000, 500_000, 500));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 3000, { bytesReceived: 340_000, packetsReceived: 400, packetsLost: 30, freezeCount: 2 }));
		}
		call.update();
		expect(issues).toHaveLength(0);

		// second consecutive bad tick → raised once
		observer.accept(publisherSample(4000, 700_000, 700));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiverSample(id, 4000, { bytesReceived: 380_000, packetsReceived: 500, packetsLost: 60, freezeCount: 4 }));
		}
		call.update();
		expect(issues).toHaveLength(1);

		observer.close();
	});
});

describe('observer-level detectors', () => {
	it('runs observer.detectors on update() and surfaces observer-issue', () => {
		const observer = setup();
		const issues: { type: string }[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		let ran = 0;

		observer.detectors.add({
			name: 'test-observer-detector',
			update: () => {
				ran += 1;
				observer.addIssue({ type: 'SFU_WIDE_TEST', timestamp: Date.now() });
			},
		});

		observer.update();
		observer.update();

		expect(ran).toBe(2);
		expect(issues.map((i) => i.type)).toEqual([ 'SFU_WIDE_TEST', 'SFU_WIDE_TEST' ]);

		observer.close();
	});
});
