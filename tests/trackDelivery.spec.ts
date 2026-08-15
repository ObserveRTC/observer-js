import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import { TrackDeliveryMismatchDetector, TrackDeliveryMismatchTypes } from '../src/detectors/TrackDeliveryMismatchDetector';
import { UnconsumedTrackDetector, UnconsumedTrackTypes } from '../src/detectors/UnconsumedTrackDetector';
import { makeSample } from './helpers/samples';
import { payloadOf } from './helpers/issues';

const PRODUCER = 'P';

const raise = (type: string, key: string, payload: Record<string, unknown>, timestamp: number) =>
	({ type, key, payload: JSON.stringify(payload), timestamp });

function newObserver(withResolver = true) {
	const observer = new Observer({
		...(withResolver ? { createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory() } : {}),
		autoUpdateOnCallUpdate: false,
		// No isolation config needed: a fresh Observer starts with zero detectors — nothing is
		// created implicitly, so only what a test explicitly registers can raise.
	});

	// Pre-create the call with client-driven auto-update disabled too, so `accept()` (which would
	// otherwise create it with the default `autoUpdateOnClientUpdate: true`) reuses this one.
	observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false });

	return observer;
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


describe('TrackDeliveryMismatchDetector', () => {
	const ids = [ 'B', 'C', 'D' ];

	function setup() {
		const observer = newObserver();
		const issues: { type: string, payload?: string | Record<string, unknown> }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000, 100));
		for (const id of ids) observer.accept(receiver(id, 1000));

		const call = observer.getObservedCall('call-1')!;
		const detector = new TrackDeliveryMismatchDetector(call, {});

		// The detector is an `ActiveIssueTracker`, fed pushed issues rather than polling for them —
		// wire it up for the two issue types it cares about.
		call.activeIssuesRegistry.addIssueTracker('dry-inbound-track', detector);
		call.activeIssuesRegistry.addIssueTracker('dry-outbound-track', detector);
		call.detectors.add(detector);

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
		expect(payload.numberOfDrySubscribers).toBe(3);
		expect(payload.numberOfSubscribers).toBe(3);
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

		// The detector reports counts, not per-client ids: one of the three subscribers is dry.
		expect(payload.numberOfDrySubscribers).toBe(1);
		expect(payload.numberOfSubscribers).toBe(3);

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
		const issues: { type: string, payload?: string | Record<string, unknown> }[] = [];

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
		const detector = new TrackDeliveryMismatchDetector(call, {});

		call.activeIssuesRegistry.addIssueTracker('dry-inbound-track', detector);
		call.activeIssuesRegistry.addIssueTracker('dry-outbound-track', detector);
		call.detectors.add(detector);

		observer.accept(publisher(2000, 300));
		for (const id of [ 'B', 'C', 'D' ]) observer.accept(receiver(id, 2000, [ dry(id, 2000) ]));
		call.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});

/**
 * `UnconsumedTrackDetector` no longer walks the call's published tracks — it reads
 * `call.unconsumedOutboundTracks`, which the resolver maintains at the two moments the answer can
 * change. That makes the index load-bearing: if it drifts, the detector goes blind or cries wolf.
 */
describe('unconsumedOutboundTracks index', () => {
	it('holds a published track until a subscriber links, then releases it', () => {
		const observer = newObserver();

		observer.accept(publisher(1000, 100));

		const call = observer.getObservedCall('call-1')!;

		// Published, nobody subscribed yet — the normal state at join time.
		expect(call.unconsumedOutboundTracks.size).toBe(1);

		observer.accept(receiver('B', 1000));
		expect(call.unconsumedOutboundTracks.size).toBe(0);

		observer.close();
	});

	it('puts the track back when its last subscriber leaves', () => {
		const observer = newObserver();

		observer.accept(publisher(1000, 100));
		observer.accept(receiver('B', 1000));
		observer.accept(receiver('C', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(call.unconsumedOutboundTracks.size).toBe(0);

		call.getObservedClient('B')?.close();
		expect(call.unconsumedOutboundTracks.size).toBe(0);   // C still subscribed

		call.getObservedClient('C')?.close();
		expect(call.unconsumedOutboundTracks.size).toBe(1);   // now genuinely unconsumed

		observer.close();
	});

	it('is empty without a resolver — "no subscribers" is unknowable then', () => {
		const observer = newObserver(false);

		observer.accept(publisher(1000, 100));

		expect(observer.getObservedCall('call-1')!.unconsumedOutboundTracks.size).toBe(0);

		observer.close();
	});
});
