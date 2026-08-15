import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/utils/RemoteTrackResolverFactories';
import { TrackDistributionAggregator } from '../src/utils/TrackDistributionAggregator';
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
		// Isolate the detector under test: without this the auto-created built-ins would raise
		// their own findings and the assertions below could not attribute an issue to one detector.
		observerDetectors: null,
		callDetectors: null,
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
