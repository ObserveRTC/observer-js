import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/utils/RemoteTrackResolverFactories';
import { TrackDeliveryMismatchDetector, TrackDeliveryMismatchTypes } from '../src/detectors/TrackDeliveryMismatchDetector';
import { UnconsumedTrackDetector, UnconsumedTrackTypes } from '../src/detectors/UnconsumedTrackDetector';
import { CommonSourceDegradationDetector } from '../src/detectors/CommonSourceDegradationDetector';
import { makeSample } from './helpers/samples';

const PRODUCER = 'P';

const raise = (type: string, key: string, payload: Record<string, unknown>, timestamp: number) =>
	({ type, key, payload: JSON.stringify(payload), timestamp });

function newObserver(withResolver = true) {
	return new Observer({
		...(withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
		updatePolicy: 'none',
		defaultCallUpdatePolicy: 'none',
	});
}

/** Publisher A of PRODUCER. `packetsSent` frozen between ticks = the source went dry. */
const publisher = (timestamp: number, packetsSent: number, clientIssues?: ReturnType<typeof raise>[]) => ({
	...makeSample({
		clientId: 'A',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pcA',
			outbound: [ { trackId: 'tA', kind: 'video', ssrc: 1, bytesSent: packetsSent * 1000, packetsSent, attachments: { producerId: PRODUCER } } ],
		} ],
	}),
	...(clientIssues ? { clientIssues } : {}),
});

const receiver = (clientId: string, timestamp: number, clientIssues?: ReturnType<typeof raise>[]) => ({
	...makeSample({
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc${clientId}`,
			inbound: [ { trackId: `in${clientId}`, kind: 'video', ssrc: 1, bytesReceived: 100_000, packetsReceived: 100, attachments: { producerId: PRODUCER, consumerId: `c${clientId}` } } ],
		} ],
	}),
	...(clientIssues ? { clientIssues } : {}),
});

const dry = (clientId: string, timestamp: number) =>
	raise('dry-inbound-track', `dry-${clientId}`, { trackId: `in${clientId}`, duration: 5000 }, timestamp);

const payloadOf = (issue: { payload?: string }) => JSON.parse(issue.payload!);

describe('TrackDeliveryMismatchDetector', () => {
	const ids = [ 'B', 'C', 'D' ];

	function setup() {
		const observer = newObserver();
		const issues: { type: string, payload?: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));
		for (const id of ids) observer.accept(receiver(id, 1000));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new TrackDeliveryMismatchDetector(call));

		return { observer, issues, call };
	}

	it('blames the forwarding path when the source is sending but ALL receivers are dry', () => {
		const { observer, issues, call } = setup();

		// publisher keeps sending (packetsSent advances), every receiver reports dry
		observer.accept(publisher(2000, 300));
		for (const id of ids) observer.accept(receiver(id, 2000, [ dry(id, 2000) ]));
		call.update();

		const issue = issues.find((i) => i.type === TrackDeliveryMismatchTypes.publishedTrackNotDelivered);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.publisherSending).toBe(true);
		expect(payload.dryReceivers).toBe(3);
		expect(payload.dryRatio).toBe(1);
		expect(payload.trackId).toBe('tA');
		expect(payload.publisherClientId).toBe('A');

		observer.close();
	});

	it('blames the individual consumers when only SOME receivers are dry', () => {
		const { observer, issues, call } = setup();

		observer.accept(publisher(2000, 300));
		observer.accept(receiver('B', 2000, [ dry('B', 2000) ]));
		observer.accept(receiver('C', 2000));
		observer.accept(receiver('D', 2000));
		call.update();

		const issue = issues.find((i) => i.type === TrackDeliveryMismatchTypes.receiverTrackNotDelivered);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.dryClientIds).toEqual([ 'B' ]);
		expect(payload.healthyClientIds.sort()).toEqual([ 'C', 'D' ]);

		observer.close();
	});

	it('blames the source (not the SFU) when the publisher itself went dry', () => {
		const { observer, issues, call } = setup();

		// packetsSent frozen at 100 AND the publisher reports dry-outbound-track
		observer.accept(publisher(2000, 100, [ raise('dry-outbound-track', 'dryA', { trackId: 'tA', duration: 5000 }, 2000) ]));
		for (const id of ids) observer.accept(receiver(id, 2000, [ dry(id, 2000) ]));
		call.update();

		expect(issues.map((i) => i.type)).toContain(TrackDeliveryMismatchTypes.publisherTrackDry);
		expect(issues.map((i) => i.type)).not.toContain(TrackDeliveryMismatchTypes.publishedTrackNotDelivered);

		observer.close();
	});

	it('stays silent when nobody is dry', () => {
		const { observer, issues, call } = setup();

		observer.accept(publisher(2000, 300));
		for (const id of ids) observer.accept(receiver(id, 2000));
		call.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('UnconsumedTrackDetector', () => {
	it('reports a published track nobody subscribes to, once it has persisted', () => {
		const observer = newObserver();
		const issues: { type: string, payload?: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));

		const call = observer.getObservedCall('call-1')!;

		// zero-duration threshold so the test doesn't have to wait
		call.detectors.add(new UnconsumedTrackDetector(call, { minUnconsumedDurationInMs: 0, minBitrate: 0 }));

		observer.accept(publisher(2000, 300));
		call.update();

		const issue = issues.find((i) => i.type === UnconsumedTrackTypes.unconsumedPublishedTrack);

		expect(issue).toBeDefined();
		expect(payloadOf(issue!).trackId).toBe('tA');
		expect(payloadOf(issue!).publisherClientId).toBe('A');

		observer.close();
	});

	it('says nothing once the track has a subscriber', () => {
		const observer = newObserver();
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));
		observer.accept(receiver('B', 1000));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new UnconsumedTrackDetector(call, { minUnconsumedDurationInMs: 0, minBitrate: 0 }));

		observer.accept(publisher(2000, 300));
		observer.accept(receiver('B', 2000));
		call.update();

		expect(issues.filter((i) => i.type === UnconsumedTrackTypes.unconsumedPublishedTrack)).toHaveLength(0);

		observer.close();
	});

	it('refuses to run without a resolver, because empty links would look like no subscribers', () => {
		const observer = newObserver(false);
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new UnconsumedTrackDetector(call, { minUnconsumedDurationInMs: 0, minBitrate: 0 }));

		observer.accept(publisher(2000, 300));
		call.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('RemoteTrackResolver requirement', () => {
	// The resolver-dependent detectors don't error without links — they simply see no
	// publisher↔subscriber distributions and stay quiet. Documented on each class and in the README.
	it('resolver-dependent detectors stay silent when no resolver is configured', () => {
		const observer = newObserver(false);
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));
		for (const id of [ 'B', 'C', 'D' ]) observer.accept(receiver(id, 1000));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CommonSourceDegradationDetector(call, { consecutiveTicks: 1 }));
		call.detectors.add(new TrackDeliveryMismatchDetector(call));

		observer.accept(publisher(2000, 300));
		for (const id of [ 'B', 'C', 'D' ]) observer.accept(receiver(id, 2000, [ dry(id, 2000) ]));
		call.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});
