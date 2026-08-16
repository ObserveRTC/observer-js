import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import { CallConcurrentIssueDetector, CallConcurrentIssueTypes, CallConcurrentIssueDetectorConfig } from '../src/detectors/CallConcurrentIssueDetector';
import { ObserverConcurrentIssueDetector, ObserverConcurrentIssueTypes, ObserverConcurrentIssueDetectorConfig } from '../src/detectors/ObserverConcurrentIssueDetector';
import { IssueFanOutDetector, IssueFanOutTypes, IssueFanOutDetectorConfig } from '../src/detectors/IssueFanOutDetector';
import type { ResolvedActiveClientIssue } from '../src/issues/ActiveClientIssue';
import { makeSample } from './helpers/samples';
import { payloadOf, type CollectedIssue } from './helpers/issues';

// Each detector fills in its own defaults for whatever a partial config omits, so an empty object is
// a valid "defaults" placeholder here — there is no exported default-config constant to import any
// more; each detector owns its defaults, in its own constructor. `issueTypes` is required though —
// the old wildcard subscription is gone, so every construction below names the types it raises,
// either here or at the call site via a spread override.
const defaultObserverDetectorsConfig: { concurrentIssueDetector: Partial<ObserverConcurrentIssueDetectorConfig> } = {
	concurrentIssueDetector: {},
};
const defaultCallDetectorsConfig: {
	concurrentIssueDetector: Partial<CallConcurrentIssueDetectorConfig>,
	issueFanOutDetector: Partial<IssueFanOutDetectorConfig>,
} = {
	concurrentIssueDetector: {},
	issueFanOutDetector: { issueTypes: [ 'freezed-video-track' ] },
};

const PRODUCER = 'P';

/** A raise entry as client-monitor-js >= 4.6.0 puts it on the wire. */
function raise(type: string, key: string, payload: Record<string, unknown> = {}, timestamp = Date.now()) {
	return { type, key, payload: JSON.stringify(payload), timestamp };
}

/** The `<type>-resolved` companion sharing the same key. */
function resolve(type: string, key: string, payload: Record<string, unknown> = {}, timestamp = Date.now()) {
	return { type: `${type}-resolved`, key, payload: JSON.stringify(payload), timestamp };
}

function issueSample(clientId: string, timestamp: number, clientIssues: ReturnType<typeof raise>[]) {
	return { ...makeSample({ clientId, timestamp }), clientIssues };
}

function newObserver() {
	return new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		// Manual update control: the ratio gates these detectors apply can cross threshold on a
		// partial accept sequence, and an automatic per-sample update would raise on that partial state.
		autoUpdateOnCallUpdate: false,
		// No isolation config needed: a fresh Observer starts with zero detectors — nothing is
		// created implicitly, so only what a test explicitly registers can raise.
	});
}

const clientOf = (observer: Observer, clientId: string) =>
	observer.getObservedCall('call-1')?.getObservedClient(clientId);

describe('client issue lifecycle', () => {
	it('opens an active issue on a keyed raise and closes it on the matching -resolved entry', () => {
		const observer = newObserver();
		const resolved: ResolvedActiveClientIssue[] = [];

		observer.on('client-issue-resolved', ({ resolvedIssue }) => resolved.push(resolvedIssue));

		observer.accept(issueSample('B', 1000, [ raise('congestion', 'k1', { peerConnectionId: 'pcB' }, 1000) ]));

		const client = clientOf(observer, 'B')!;

		expect(client.activeIssues.size).toBe(1);

		const active = client.activeIssues.get('k1')!;

		expect(active.type).toBe('congestion');
		expect(active.raisedAt).toBe(1000);
		expect(active.peerConnectionId).toBe('pcB');

		observer.accept(issueSample('B', 2000, [ resolve('congestion', 'k1', { raisedAt: 1000, durationInMs: 4200, comment: 'recovered' }, 5200) ]));

		expect(client.activeIssues.size).toBe(0);
		expect(resolved).toHaveLength(1);
		expect(resolved[0].type).toBe('congestion');   // suffix stripped
		expect(resolved[0].durationInMs).toBe(4200);
		expect(resolved[0].comment).toBe('recovered');
		expect(resolved[0].resolvedBy).toBe('client');

		observer.close();
	});

	it('treats a re-raise of the same key as the same interval', () => {
		const observer = newObserver();

		observer.accept(issueSample('B', 1000, [ raise('congestion', 'k1', { availableIncomingBitrate: 100 }, 1000) ]));
		observer.accept(issueSample('B', 2000, [ raise('congestion', 'k1', { availableIncomingBitrate: 50 }, 2000) ]));

		const client = clientOf(observer, 'B')!;

		expect(client.activeIssues.size).toBe(1);
		expect(client.activeIssues.get('k1')?.raisedAt).toBe(1000);                       // not restarted
		expect(client.activeIssues.get('k1')?.payload?.availableIncomingBitrate).toBe(50); // refreshed

		observer.close();
	});

	it('does not track keyless (one-shot) issues but still reports them', () => {
		const observer = newObserver();
		const seen: string[] = [];

		observer.on('client-issue', ({ issue }) => seen.push(issue.type));

		observer.accept(issueSample('B', 1000, [ { type: 'one-shot', payload: undefined, timestamp: 1000 } as never ]));

		expect(seen).toEqual([ 'one-shot' ]);
		expect(clientOf(observer, 'B')!.activeIssues.size).toBe(0);

		observer.close();
	});

	it('force-closes still-open issues when the client closes, so the active set cannot leak', () => {
		const observer = newObserver();
		const resolved: ResolvedActiveClientIssue[] = [];

		observer.on('client-issue-resolved', ({ resolvedIssue }) => resolved.push(resolvedIssue));

		observer.accept(issueSample('B', 1000, [ raise('stuck-decoder', 'k9', {}, 1000) ]));
		expect(clientOf(observer, 'B')!.activeIssues.size).toBe(1);

		clientOf(observer, 'B')!.close();

		expect(resolved).toHaveLength(1);
		expect(resolved[0].resolvedBy).toBe('client-closed');

		observer.close();
	});
});

describe('ActiveIssuesRegistry', () => {
	// The standalone cohort-building this used to test (`issueIndex.cohortOf()` / `.cohorts()`) no
	// longer exists: the registry is now a plain push/fan-out store, and the grouping/onset-spread
	// logic it used to do lives in `ConcurrentIssueDetector.lastGroups` instead — exercised by the
	// `ConcurrentIssueDetector` describe block below and by `tests/crossCallIssues.spec.ts`.

	// The expiry safety net this used to test (`maxIssueAgeInMs`, auto-resolving a stuck issue after a
	// timeout) no longer exists anywhere in the observer/call/client layer — there is nothing left to
	// exercise here.

	it('propagates a call registry into the observer registry, and detaches on close', () => {
		const observer = newObserver();

		observer.accept(issueSample('B', 1000, [ raise('congestion', 'k1', {}, 1000) ]));

		const call = observer.getObservedCall('call-1')!;

		expect(call.activeIssuesRegistry.size).toBe(1);
		expect(observer.activeIssuesRegistry.size).toBe(1);
		// the same object, not a copy — one issue, two views
		expect([ ...observer.activeIssuesRegistry.values() ][0]).toBe([ ...call.activeIssuesRegistry.values() ][0]);

		call.close();

		expect(observer.activeIssuesRegistry.size).toBe(0);

		observer.close();
	});
});

describe('CallConcurrentIssueDetector', () => {
	it('raises ISSUE_ONSET_BURST when clients degrade together', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		for (const id of [ 'B', 'C', 'D' ]) observer.accept(makeSample({ clientId: id, timestamp: 1000 }));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new CallConcurrentIssueDetector(call, { ...defaultCallDetectorsConfig.concurrentIssueDetector, issueTypes: [ 'ice-disconnected' ] }));

		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(issueSample(id, 2000, [ raise('ice-disconnected', `k-${id}`, {}, 2000) ]));
		}
		call.update();

		expect(issues).toHaveLength(1);
		expect(issues[0].type).toBe(CallConcurrentIssueTypes.issueOnsetBurst);

		const payload = payloadOf(issues[0]);

		expect(payload.issueType).toBe('ice-disconnected');
		expect(payload.affectedClients).toBe(3);
		expect(payload.affectedRatio).toBe(1);
		expect(payload.onsetBurst).toBe(true);
		// `scope` lives on the issue now, not in the evidence.
		expect(issues[0].scope).toBe('call');

		observer.close();
	});

	it('stops reporting once the clients resolve their issues', () => {
		const observer = newObserver();
		const issues: { type: string }[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		for (const id of [ 'B', 'C', 'D' ]) observer.accept(makeSample({ clientId: id, timestamp: 1000 }));

		const call = observer.getObservedCall('call-1')!;
		const detector = new CallConcurrentIssueDetector(call, { ...defaultCallDetectorsConfig.concurrentIssueDetector, issueTypes: [ 'congestion' ], cooldownMs: 0 });

		call.detectors.add(detector);

		for (const id of [ 'B', 'C', 'D' ]) observer.accept(issueSample(id, 2000, [ raise('congestion', `k-${id}`, {}, 2000) ]));
		call.update();
		expect(detector.lastGroups).toHaveLength(1);

		for (const id of [ 'B', 'C', 'D' ]) observer.accept(issueSample(id, 3000, [ resolve('congestion', `k-${id}`, {}, 3000) ]));
		call.update();

		// the active set is empty, so nothing is concurrent any more
		expect(detector.lastGroups).toHaveLength(0);

		observer.close();
	});
});

describe('ObserverConcurrentIssueDetector', () => {
	it('works at observer scope across calls', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		// The detector is fed by subscribing to the registry (push, not poll), so it must be in place
		// before the issues open — an issue already active when a tracker subscribes is never replayed.
		observer.detectors.add(new ObserverConcurrentIssueDetector(observer, { ...defaultObserverDetectorsConfig.concurrentIssueDetector, issueTypes: [ 'congestion' ] }));

		for (const [ callId, clientId ] of [ [ 'call-a', 'a1' ], [ 'call-b', 'b1' ], [ 'call-c', 'c1' ] ]) {
			observer.accept({
				...makeSample({ callId, clientId, timestamp: 1000 }),
				clientIssues: [ raise('congestion', `k-${clientId}`, {}, 1000) ],
			});
		}

		observer.update();

		expect(issues).toHaveLength(1);
		expect(issues[0].scope).toBe('observer');
		expect(payloadOf(issues[0]).affectedClients).toBe(3);

		observer.close();
	});
});

describe('IssueFanOutDetector', () => {
	const publisher = (timestamp: number) => makeSample({
		clientId: 'A',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pcA',
			outbound: [ { trackId: 'tA', kind: 'video', ssrc: 1, bytesSent: 100_000, packetsSent: 100, attachments: { producerId: PRODUCER } } ],
		} ],
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

	it('attributes a receiver-side issue to the published track and reports the fan-out', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		// Manual update control: the affected-ratio gate can cross threshold before all three
		// receivers have reported (2 of 3 already clears the 0.6 default), and letting the call
		// auto-update per accepted sample would raise on that partial state instead of the full one.
		const call = observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false })!;

		observer.accept(publisher(1000));
		for (const id of [ 'B', 'C', 'D' ]) observer.accept(receiver(id, 1000));

		call.detectors.add(new IssueFanOutDetector(call, defaultCallDetectorsConfig.issueFanOutDetector));

		// every receiver of A's track reports a freeze, keyed on its own inbound track id
		observer.accept(publisher(2000));
		for (const id of [ 'B', 'C', 'D' ]) {
			observer.accept(receiver(id, 2000, [ raise('freezed-video-track', `k-${id}`, { trackId: `in${id}` }, 2000) ]));
		}
		call.update();

		const issue = issues.find((i) => i.type === IssueFanOutTypes.publishedTrackIssueFanOut);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.issueType).toBe('freezed-video-track');
		expect(payload.trackId).toBe('tA');                  // the PUBLISHED track, not the inbound one
		expect(payload.publisherClientId).toBe('A');
		expect(payload.receivers).toBe(3);
		expect(payload.affectedReceivers).toBe(3);
		expect(payload.affectedClientIds.sort()).toEqual([ 'B', 'C', 'D' ]);

		observer.close();
	});

	it('reports a lone affected receiver as that receiver problem, not the source', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(publisher(1000));
		for (const id of [ 'B', 'C', 'D' ]) observer.accept(receiver(id, 1000));

		const call = observer.getObservedCall('call-1')!;

		call.detectors.add(new IssueFanOutDetector(call, defaultCallDetectorsConfig.issueFanOutDetector));

		observer.accept(publisher(2000));
		observer.accept(receiver('B', 2000, [ raise('freezed-video-track', 'k-B', { trackId: 'inB' }, 2000) ]));
		observer.accept(receiver('C', 2000));
		observer.accept(receiver('D', 2000));
		call.update();

		const issue = issues.find((i) => i.type === IssueFanOutTypes.singleReceiverIssue);

		expect(issue).toBeDefined();
		expect(payloadOf(issue!).affectedClientIds).toEqual([ 'B' ]);
		expect(issues.some((i) => i.type === IssueFanOutTypes.publishedTrackIssueFanOut)).toBe(false);

		observer.close();
	});
});
