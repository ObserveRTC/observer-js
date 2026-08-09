import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/utils/RemoteTrackResolverFactories';
import { CallHealthAggregator } from '../src/utils/CallHealthAggregator';
import { CallWideDegradationDetector, CallWideDegradationTypes } from '../src/detectors/CallWideDegradationDetector';
import { PliAndFreezeFanOutDetector, PliAndFreezeFanOutTypes } from '../src/detectors/PliAndFreezeFanOutDetector';
import { AudioImpairmentFanOutDetector, AudioImpairmentFanOutTypes } from '../src/detectors/AudioImpairmentFanOutDetector';
import { IceDisruptionDetector, IceDisruptionTypes } from '../src/detectors/IceDisruptionDetector';
import { TurnServerHealthDetector, TurnServerHealthTypes } from '../src/detectors/TurnServerHealthDetector';
import { makeSample, type InboundSpec } from './helpers/samples';

const PRODUCER = 'P';

function collectIssues(observer: Observer) {
	const issues: { type: string, payload?: string }[] = [];

	observer.on('call-issue', ({ issue }) => issues.push(issue));
	observer.on('observer-issue', ({ issue }) => issues.push(issue));

	return issues;
}

const payloadOf = (issue: { payload?: string }) => JSON.parse(issue.payload!);

/** A client that both publishes (so it has outbound stats) and receives one track. */
function clientSample(clientId: string, timestamp: number, opts: {
	inbound?: Partial<InboundSpec>,
	kind?: 'audio' | 'video',
	bytesSent?: number,
	packetsSent?: number,
	ice?: { localCandidateType?: string, localUrl?: string },
} = {}) {
	const kind = opts.kind ?? 'video';

	return makeSample({
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc${clientId}`,
			outbound: [ { trackId: `out${clientId}`, kind, ssrc: 900, bytesSent: opts.bytesSent ?? 100_000, packetsSent: opts.packetsSent ?? 100 } ],
			inbound: opts.inbound
				? [ { trackId: `in${clientId}`, kind, ssrc: 1, attachments: { producerId: PRODUCER, consumerId: `c${clientId}` }, ...opts.inbound } as InboundSpec ]
				: undefined,
			ice: opts.ice,
		} ],
	});
}

/** The publisher of PRODUCER, so receivers link to something. */
function publisherSample(timestamp: number, bytesSent: number, packetsSent: number, kind: 'audio' | 'video' = 'video') {
	return makeSample({
		clientId: 'A',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pcA',
			outbound: [ { trackId: 'tA', kind, ssrc: 1, bytesSent, packetsSent, attachments: { producerId: PRODUCER } } ],
		} ],
	});
}

function newObserver() {
	return new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		updatePolicy: 'none',
		defaultCallUpdatePolicy: 'none',
	});
}

describe('CallHealthAggregator', () => {
	it('splits per-client health by direction and rolls up with percentiles', () => {
		const observer = newObserver();

		// NOTE the baseline must include every counter we later assert a delta for — `counterDelta`
		// deliberately yields 0 when there is no previous value to subtract from.
		observer.accept(clientSample('B', 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 } }));
		observer.accept(clientSample('C', 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 } }));
		// C's receiving side goes bad
		observer.accept(clientSample('B', 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 } }));
		observer.accept(clientSample('C', 2000, { inbound: { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 40, freezeCount: 3 } }));

		const call = observer.getObservedCall('call-1')!;
		const health = new CallHealthAggregator(call).aggregate();

		expect(health.numberOfClients).toBe(2);
		expect(health.numberOfDegradedClients).toBe(1);
		expect(health.numberOfInboundDegradedClients).toBe(1);

		const c = health.clients.find((x) => x.clientId === 'C')!;

		expect(c.inboundDegraded).toBe(true);
		expect(c.reasons).toEqual(expect.arrayContaining([ 'inbound-fraction-lost', 'freezes' ]));
		expect(health.freezes).toEqual({ affectedClients: 1, total: 3 });
		expect(health.inboundFractionLost?.count).toBe(2);

		observer.close();
	});
});

describe('CallWideDegradationDetector', () => {
	it('raises CALL_WIDE_INBOUND_DEGRADATION when most receiving sides are bad', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];

		for (const id of ids) observer.accept(clientSample(id, 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0 } }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CallWideDegradationDetector(call, { consecutiveTicks: 1 }));

		for (const id of ids) observer.accept(clientSample(id, 2000, { inbound: { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 40, freezeCount: 2 } }));
		call.update();

		expect(issues).toHaveLength(1);
		expect(issues[0].type).toBe(CallWideDegradationTypes.callWideInboundDegradation);

		const payload = payloadOf(issues[0]);

		expect(payload.clients).toBe(3);
		expect(payload.degradedRatio).toBe(1);
		expect(payload.affectedClientIds.sort()).toEqual(ids);
		// percentile summary, not a mean
		expect(payload.inboundFractionLost.median).toBeGreaterThan(0.1);

		observer.close();
	});

	it('stays quiet on a healthy call', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];

		for (const id of ids) observer.accept(clientSample(id, 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0 } }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CallWideDegradationDetector(call, { consecutiveTicks: 1 }));

		for (const id of ids) observer.accept(clientSample(id, 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0 } }));
		call.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('PliAndFreezeFanOutDetector', () => {
	it('raises PUBLISHER_PLI_STORM when most receivers of one source request keyframes', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];

		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of ids) observer.accept(clientSample(id, 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, pliCount: 0, freezeCount: 0 } }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new PliAndFreezeFanOutDetector(call, { minPliCount: 3 }));

		observer.accept(publisherSample(2000, 300_000, 300));
		for (const id of ids) observer.accept(clientSample(id, 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, pliCount: 4, freezeCount: 0 } }));
		call.update();

		const storm = issues.find((i) => i.type === PliAndFreezeFanOutTypes.publisherPliStorm);

		expect(storm).toBeDefined();

		const payload = payloadOf(storm!);

		expect(payload.receivers).toBe(3);
		expect(payload.affectedReceivers).toBe(3);
		expect(payload.total).toBe(12);
		expect(payload.publisherClientId).toBe('A');

		observer.close();
	});

	it('does not raise for a single receiver requesting keyframes', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];

		observer.accept(publisherSample(1000, 100_000, 100));
		for (const id of ids) observer.accept(clientSample(id, 1000, { inbound: { bytesReceived: 100_000, packetsReceived: 100, pliCount: 0 } }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new PliAndFreezeFanOutDetector(call, { minPliCount: 3 }));

		observer.accept(publisherSample(2000, 300_000, 300));
		observer.accept(clientSample('B', 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, pliCount: 20 } }));
		observer.accept(clientSample('C', 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, pliCount: 0 } }));
		observer.accept(clientSample('D', 2000, { inbound: { bytesReceived: 300_000, packetsReceived: 300, pliCount: 0 } }));
		call.update();

		expect(issues.filter((i) => i.type === PliAndFreezeFanOutTypes.publisherPliStorm)).toHaveLength(0);

		observer.close();
	});
});

describe('AudioImpairmentFanOutDetector', () => {
	it('raises PUBLISHED_AUDIO_DEGRADED_FOR_MAJORITY when concealment follows the source', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];
		const base = { bytesReceived: 100_000, packetsReceived: 100, concealedSamples: 0, totalSamplesReceived: 10_000 };

		observer.accept(publisherSample(1000, 100_000, 100, 'audio'));
		for (const id of ids) observer.accept(clientSample(id, 1000, { kind: 'audio', inbound: base }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new AudioImpairmentFanOutDetector(call, { consecutiveTicks: 1 }));

		// every receiver conceals 20% of the samples it got this tick
		observer.accept(publisherSample(2000, 300_000, 300, 'audio'));
		for (const id of ids) {
			observer.accept(clientSample(id, 2000, { kind: 'audio', inbound: { bytesReceived: 300_000, packetsReceived: 300, concealedSamples: 2000, totalSamplesReceived: 20_000 } }));
		}
		call.update();

		const issue = issues.find((i) => i.type === AudioImpairmentFanOutTypes.publishedAudioDegradedForMajority);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.receivers).toBe(3);
		expect(payload.affectedReceivers).toBe(3);
		expect(payload.publisherClientId).toBe('A');

		observer.close();
	});
});

describe('IceDisruptionDetector', () => {
	it('raises CALL_ICE_DISRUPTION when most clients drop ICE inside the window', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const ids = [ 'B', 'C', 'D' ];

		for (const id of ids) observer.accept(clientSample(id, 1000));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new IceDisruptionDetector(call));

		// ICE_CONNECTION_STATE_CHANGED -> disconnected for all three
		for (const id of ids) {
			observer.accept(makeSample({
				clientId: id,
				timestamp: 2000,
				peerConnections: [ { peerConnectionId: `pc${id}` } ],
				clientEvents: [ {
					type: 'ICE_CONNECTION_STATE_CHANGED',
					payload: JSON.stringify({ peerConnectionId: `pc${id}`, iceConnectionState: 'disconnected' }),
				} ],
			}));
		}
		call.update();

		const issue = issues.find((i) => i.type === IceDisruptionTypes.callIceDisruption);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.clients).toBe(3);
		expect(payload.affectedClients).toBe(3);
		expect(payload.affectedClientIds.sort()).toEqual(ids);

		observer.close();
	});

	it('removes its bus listeners on close (no leak, no post-close firing)', () => {
		const observer = newObserver();

		observer.accept(clientSample('B', 1000));

		const call = observer.getObservedCall('call-1')!;
		const before = observer.listenerCount('ice-connection-state-changed');
		const detector = new IceDisruptionDetector(call);

		call.detectors.add(detector);
		expect(observer.listenerCount('ice-connection-state-changed')).toBe(before + 1);

		call.detectors.remove(detector);
		expect(observer.listenerCount('ice-connection-state-changed')).toBe(before);

		observer.close();
	});
});

describe('TurnServerHealthDetector (observer level)', () => {
	it('raises TURN_SERVER_DEGRADED for the bad server only', () => {
		const observer = newObserver();
		const issues = collectIssues(observer);
		const good = 'turn:good.example.org:3478';
		const bad = 'turn:bad.example.org:3478';

		const relaySample = (clientId: string, timestamp: number, url: string, inbound: Partial<InboundSpec>) => makeSample({
			clientId,
			timestamp,
			peerConnections: [ {
				peerConnectionId: `pc${clientId}`,
				ice: { localCandidateType: 'relay', localUrl: url },
				inbound: [ { trackId: `in${clientId}`, kind: 'video', ssrc: 1, ...inbound } as InboundSpec ],
			} ],
		});

		const badIds = [ 'b1', 'b2', 'b3' ];
		const goodIds = [ 'g1', 'g2', 'g3' ];

		for (const id of [ ...badIds, ...goodIds ]) {
			const url = badIds.includes(id) ? bad : good;

			observer.accept(relaySample(id, 1000, url, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0 }));
		}

		observer.detectors.add(new TurnServerHealthDetector(observer, {
			minClientsPerServer: 3,
			consecutiveTicks: 1,
		}));

		// bad server's clients lose 20% of packets; good server's clients stay clean
		for (const id of badIds) observer.accept(relaySample(id, 2000, bad, { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 50 }));
		for (const id of goodIds) observer.accept(relaySample(id, 2000, good, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0 }));

		observer.update();

		const issue = issues.find((i) => i.type === TurnServerHealthTypes.turnServerDegraded);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.serverUrl).toBe(bad);
		expect(payload.peerConnections).toBe(3);
		expect(payload.degradedPeerConnections).toBe(3);
		expect(payload.affectedClientIds.sort()).toEqual(badIds);
		// the healthy server is reported as comparison context
		expect(payload.otherServers.find((s: { serverUrl: string }) => s.serverUrl === good)?.degradedRatio).toBe(0);

		observer.close();
	});
});
