import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import { CallHealthAggregator } from '../src/utils/CallHealthAggregator';
import { TurnServerHealthDetector, TurnServerHealthTypes, TurnServerHealthDetectorConfig } from '../src/detectors/TurnServerHealthDetector';
import { legacyPayload, makeSample, type InboundSpec } from './helpers/samples';
import { payloadOf, type CollectedIssue } from './helpers/issues';

// `TurnServerHealthDetector` fills in its own defaults for whatever a partial config omits, so an
// empty object is a valid "defaults" placeholder here — there is no exported default-config constant
// to import any more; each detector owns its defaults, in its own constructor.
const defaultObserverDetectorsConfig: { turnServerHealthDetector: Partial<TurnServerHealthDetectorConfig> } = {
	turnServerHealthDetector: {},
};

/** A raise entry as pre-3.5.0 clients put it on the wire: a JSON string payload. */
const raise = (type: string, key: string, payload: Record<string, unknown>, timestamp: number) =>
	({ type, key, payload: legacyPayload(payload), timestamp });


function newObserver() {
	return new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		// Manual update control: the ratio/streak gates these detectors apply can cross threshold on a
		// partial accept sequence, and an automatic per-sample update would raise on that partial state.
		autoUpdateOnCallUpdate: false,
		// No isolation needed any more: a fresh Observer starts with zero detectors — nothing is
		// created implicitly, so only what a test explicitly registers can raise.
	});
}

function clientSample(clientId: string, timestamp: number, inbound: Partial<InboundSpec>) {
	return makeSample({
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc${clientId}`,
			outbound: [ { trackId: `out${clientId}`, kind: 'video', ssrc: 900, bytesSent: 100_000, packetsSent: 100 } ],
			inbound: [ { trackId: `in${clientId}`, kind: 'video', ssrc: 1, ...inbound } as InboundSpec ],
		} ],
	});
}

describe('CallHealthAggregator', () => {
	it('splits per-client health by direction and rolls up with percentiles', () => {
		const observer = newObserver();

		// NOTE the baseline must include every counter we later assert a delta for — `counterDelta`
		// deliberately yields 0 when there is no previous value to subtract from.
		observer.accept(clientSample('B', 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
		observer.accept(clientSample('C', 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
		// C's receiving side goes bad
		observer.accept(clientSample('B', 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 }));
		observer.accept(clientSample('C', 2000, { bytesReceived: 140_000, packetsReceived: 200, packetsLost: 40, freezeCount: 3 }));

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
	});

	it('reports a healthy call as healthy', () => {
		const observer = newObserver();

		for (const id of [ 'B', 'C' ]) {
			observer.accept(clientSample(id, 1000, { bytesReceived: 100_000, packetsReceived: 100, packetsLost: 0, freezeCount: 0 }));
			observer.accept(clientSample(id, 2000, { bytesReceived: 300_000, packetsReceived: 300, packetsLost: 0, freezeCount: 0 }));
		}

		const health = new CallHealthAggregator(observer.getObservedCall('call-1')!).aggregate();

		expect(health.numberOfDegradedClients).toBe(0);
		expect(health.degradedRatio).toBe(0);
	});
});

describe('TurnServerHealthDetector (observer level, issue-driven)', () => {
	const badUrl = 'turn:bad.example.org:3478';
	const goodUrl = 'turn:good.example.org:3478';

	/** A relayed client, optionally reporting an issue of its own. */
	const relaySample = (clientId: string, timestamp: number, url: string, clientIssues?: ReturnType<typeof raise>[]) => ({
		...makeSample({
			clientId,
			timestamp,
			peerConnections: [ {
				peerConnectionId: `pc${clientId}`,
				ice: { localCandidateType: 'relay', localUrl: url },
				inbound: [ { trackId: `in${clientId}`, kind: 'video', ssrc: 1, bytesReceived: 100_000, packetsReceived: 100 } ],
			} ],
		}),
		...(clientIssues ? { clientIssues } : {}),
	});

	it('raises TURN_SERVER_DEGRADED for the relay whose clients report issues', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const badIds = [ 'b1', 'b2', 'b3' ];
		const goodIds = [ 'g1', 'g2', 'g3' ];

		for (const id of badIds) observer.accept(relaySample(id, 1000, badUrl));
		for (const id of goodIds) observer.accept(relaySample(id, 1000, goodUrl));

		observer.detectors.add(new TurnServerHealthDetector(observer, { ...defaultObserverDetectorsConfig.turnServerHealthDetector, minClientsPerServer: 3,
			consecutiveTicks: 1 }));

		// the bad relay's clients report congestion; the good relay's clients stay quiet
		for (const id of badIds) observer.accept(relaySample(id, 2000, badUrl, [ raise('congestion', `k-${id}`, {}, 2000) ]));
		for (const id of goodIds) observer.accept(relaySample(id, 2000, goodUrl));

		observer.update();

		const issue = issues.find((i) => i.type === TurnServerHealthTypes.turnServerDegraded);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.serverUrl).toBe(badUrl);
		expect(payload.clients).toBe(3);
		expect(payload.degradedClients).toBe(3);
		expect(payload.degradedRatio).toBe(1);
		expect(payload.affectedClientIds.sort()).toEqual(badIds);
		expect(payload.issueTypes).toEqual([ 'congestion' ]);
		// the healthy relay is carried as comparison context
		expect(payload.otherServers.find((s: { serverUrl: string }) => s.serverUrl === goodUrl)?.degradedRatio).toBe(0);

		observer.close();
	});

	it('stays silent when the relayed clients report nothing', () => {
		const observer = newObserver();
		const issues: { type: string }[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		for (const id of [ 'a1', 'a2', 'a3' ]) observer.accept(relaySample(id, 1000, goodUrl));

		observer.detectors.add(new TurnServerHealthDetector(observer, { ...defaultObserverDetectorsConfig.turnServerHealthDetector, minClientsPerServer: 3, consecutiveTicks: 1 }));

		for (const id of [ 'a1', 'a2', 'a3' ]) observer.accept(relaySample(id, 2000, goodUrl));
		observer.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});

	it('stops reporting once the clients resolve', () => {
		const observer = newObserver();
		const ids = [ 'r1', 'r2', 'r3' ];

		for (const id of ids) observer.accept(relaySample(id, 1000, badUrl));

		const detector = new TurnServerHealthDetector(observer, { ...defaultObserverDetectorsConfig.turnServerHealthDetector, minClientsPerServer: 3,
			consecutiveTicks: 1,
			cooldownMs: 0 });

		observer.detectors.add(detector);

		for (const id of ids) observer.accept(relaySample(id, 2000, badUrl, [ raise('congestion', `k-${id}`, {}, 2000) ]));
		observer.update();
		expect(detector.lastServers[0].degradedClients).toBe(3);

		for (const id of ids) {
			observer.accept(relaySample(id, 3000, badUrl, [
				{ type: 'congestion-resolved', key: `k-${id}`, payload: legacyPayload({ raisedAt: 2000 }), timestamp: 3000 },
			]));
		}
		observer.update();

		expect(detector.lastServers[0].degradedClients).toBe(0);

		observer.close();
	});
});

describe('observer-level detector registry', () => {
	it('runs observer.detectors on update() and surfaces observer-issue', () => {
		const observer = newObserver();
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
