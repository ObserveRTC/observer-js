import { Observer } from '../src/Observer';
import { ObserverConcurrentIssueDetector, ObserverConcurrentIssueTypes, ObserverConcurrentIssueDetectorConfig } from '../src/detectors/ObserverConcurrentIssueDetector';
import { CallConcurrentIssueDetector, CallConcurrentIssueTypes, CallConcurrentIssueDetectorConfig } from '../src/detectors/CallConcurrentIssueDetector';
import { concludeCallIssue, concludeObserverIssue } from '../src/detectors/IssueConclusion';
import type { ClientSample } from '../src/schema/ClientSample';
import { payloadOf, type CollectedIssue } from './helpers/issues';

/**
 * The observer-scope question: is the *infrastructure* in trouble? Answering it needs the cohort to
 * span independent calls — one bad meeting is the call-scoped detector's business, and raising a
 * fleet alert for it would be a false positive with a very plausible-looking payload.
 *
 * `ConcurrentIssueDetector` (one class serving both scopes) is gone, split into
 * `ObserverConcurrentIssueDetector` (this file's subject) and `CallConcurrentIssueDetector`. Each now
 * requires an explicit, non-empty `issueTypes` — the old wildcard subscription is removed, so a
 * detector built with `issueTypes: []` sees nothing and never fires.
 */

// Each detector fills in its own defaults for whatever a partial config omits beyond `issueTypes`,
// which is required — there is no "all types" option any more, so a placeholder config always names
// the type these tests raise.
const defaultObserverDetectorsConfig: { concurrentIssueDetector: Partial<ObserverConcurrentIssueDetectorConfig> } = {
	concurrentIssueDetector: { issueTypes: [ 'congestion' ] },
};
const defaultCallDetectorsConfig: { concurrentIssueDetector: Partial<CallConcurrentIssueDetectorConfig> } = {
	concurrentIssueDetector: { issueTypes: [ 'congestion' ] },
};

const raise = (type: string, key: string, timestamp: number) =>
	({ type, key, payload: JSON.stringify({}), timestamp });

const sample = (
	callId: string,
	clientId: string,
	timestamp: number,
	clientIssues?: ReturnType<typeof raise>[],
): ClientSample => ({
	callId,
	clientId,
	timestamp,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
	clientIssues,
} as ClientSample);

function newObserver() {
	return new Observer({
		// Manual update control: these tests build up state across several `accept()` calls and only
		// want the detector to see it once, at the explicit `observer.update()` below.
		autoUpdateOnCallUpdate: false,
		// No isolation config needed: a fresh Observer starts with zero detectors, and nothing is
		// created implicitly, so only the detector each test builds itself can raise.
	});
}

describe('ObserverConcurrentIssueDetector', () => {
	it('raises CROSS_CALL_ISSUE_ONSET_BURST when congestion opens in several independent calls', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new ObserverConcurrentIssueDetector(observer, defaultObserverDetectorsConfig.concurrentIssueDetector);

		observer.detectors.add(detector);

		// Three calls of two participants each. One client per call becomes congested — a tiny share
		// of the fleet, but spread across calls that share nothing except the server.
		for (const callId of [ 'call-a', 'call-b', 'call-c' ]) {
			observer.accept(sample(callId, `${callId}-1`, 1000, [ raise('congestion', `${callId}-c`, 1000) ]));
			observer.accept(sample(callId, `${callId}-2`, 1000));
		}
		observer.update();
		detector.update();

		const issue = issues.find((i) => i.type === ObserverConcurrentIssueTypes.crossCallIssueOnsetBurst);

		expect(issue).toBeDefined();

		const payload = payloadOf(issue!);

		expect(payload.issueType).toBe('congestion');
		expect(payload.affectedCalls).toBe(3);
		expect(payload.calls).toBe(3);
		expect(payload.affectedClients).toBe(3);
		expect(payload.perCall).toHaveLength(3);
		// `scope` and `conclusion` are fields of the issue, not of the evidence.
		expect(issue!.scope).toBe('observer');
		expect(issue!.conclusion?.faultDomain).toBe('infrastructure');
		expect(issue!.conclusion?.recommendation).toMatch(/egress|network/i);

		observer.close();
	});

	it('stays silent when the same count of clients is confined to ONE call', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new ObserverConcurrentIssueDetector(observer, defaultObserverDetectorsConfig.concurrentIssueDetector);

		observer.detectors.add(detector);

		// Same three congested clients, but all in one meeting — one call can never satisfy
		// `minAffectedCalls` (default 2), and the call-scoped detector already reports this locally.
		for (const n of [ 1, 2, 3 ]) {
			observer.accept(sample('call-a', `a${n}`, 1000, [ raise('congestion', `a${n}-c`, 1000) ]));
		}
		observer.accept(sample('call-a', 'a4', 1000));
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});

	it('is not suppressed by the participant ratio — a fleet event is a small share of all clients', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new ObserverConcurrentIssueDetector(observer, defaultObserverDetectorsConfig.concurrentIssueDetector);

		observer.detectors.add(detector);

		// 3 congested clients out of 30 = a 10% participant ratio. Observer scope has no participant
		// ratio gate (only `affectedCallRatioThreshold`, default 0 / off) — applying a call-scope-sized
		// ratio here would hide every real fleet event.
		for (const callId of [ 'call-a', 'call-b', 'call-c' ]) {
			observer.accept(sample(callId, `${callId}-1`, 1000, [ raise('congestion', `${callId}-c`, 1000) ]));
			for (let n = 2; n <= 10; n++) observer.accept(sample(callId, `${callId}-${n}`, 1000));
		}
		observer.update();
		detector.update();

		const issue = issues.find((i) => i.type === ObserverConcurrentIssueTypes.crossCallIssueOnsetBurst);

		expect(issue).toBeDefined();
		expect(payloadOf(issue!).affectedRatio).toBeLessThan(0.5);

		observer.close();
	});

	it('honours minAffectedCalls', () => {
		const observer = newObserver();
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		const detector = new ObserverConcurrentIssueDetector(observer, { ...defaultObserverDetectorsConfig.concurrentIssueDetector, minAffectedCalls: 4 });

		observer.detectors.add(detector);

		for (const callId of [ 'call-a', 'call-b', 'call-c' ]) {
			observer.accept(sample(callId, `${callId}-1`, 1000, [ raise('congestion', `${callId}-c`, 1000) ]));
		}
		observer.update();
		detector.update();

		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('CallConcurrentIssueDetector', () => {
	it('keeps its own types and its participant-ratio gate', () => {
		const observer = newObserver();
		const issues: CollectedIssue[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));

		observer.accept(sample('call-a', 'a1', 1000));

		const call = observer.getObservedCall('call-a')!;
		const detector = new CallConcurrentIssueDetector(call, defaultCallDetectorsConfig.concurrentIssueDetector);

		call.detectors.add(detector);

		for (const n of [ 1, 2, 3 ]) {
			observer.accept(sample('call-a', `a${n}`, 1000, [ raise('congestion', `a${n}-c`, 1000) ]));
		}
		call.update();
		detector.update();

		const issue = issues.find((i) => i.type === CallConcurrentIssueTypes.issueOnsetBurst);

		expect(issue).toBeDefined();

		expect(issue!.scope).toBe('call');
		expect(issue!.conclusion?.faultDomain).toBe('call');

		observer.close();
	});
});

describe('concludeObserverIssue', () => {
	const base = {
		affectedClients: 6,
		totalClients: 60,
		affectedCalls: 6,
		totalCalls: 40,
		onsetBurst: true,
	};

	it('blames the infrastructure for congestion spread across calls', () => {
		const conclusion = concludeObserverIssue({ ...base, issueType: 'congestion' });

		expect(conclusion.faultDomain).toBe('infrastructure');
		expect(conclusion.summary).toContain('6 of 40 calls');
		expect(0.7).toBeLessThanOrEqual(conclusion.confidence);
	});

	// The nuance worth having: breadth does not always mean "the server". CPU is owned by the
	// endpoint, so the same spread points at what those endpoints share instead.
	it('blames the client population, not the servers, for CPU limitation spread across calls', () => {
		const conclusion = concludeObserverIssue({ ...base, issueType: 'cpu-limitation' });

		expect(conclusion.faultDomain).toBe('client-population');
		expect(conclusion.recommendation).toMatch(/client release|browser|hardware/i);
	});

	it('blames connectivity infrastructure for ICE issues spread across calls', () => {
		expect(concludeObserverIssue({ ...base, issueType: 'ice-disconnected' }).recommendation)
			.toMatch(/TURN|reachability/i);
	});

	it('falls back cleanly for an issue type it has never heard of', () => {
		const conclusion = concludeObserverIssue({ ...base, issueType: 'my-custom-app-issue' });

		expect(conclusion.faultDomain).toBe('infrastructure');
		expect(conclusion.summary).toContain('my-custom-app-issue');
		expect(conclusion.summary).toContain('independent calls');
	});

	// A single affected call is not a fleet finding, whatever the client count says: it has an
	// obvious local explanation and the call-scoped detector has already reported it.
	it('refuses to call a single-call spread an infrastructure problem', () => {
		const conclusion = concludeObserverIssue({ ...base, affectedCalls: 1, issueType: 'congestion' });

		expect(conclusion.faultDomain).toBe('call');
		expect(conclusion.summary).toMatch(/single call/i);
	});
});

describe('concludeCallIssue', () => {
	it('attributes a track-scoped group to the published track', () => {
		const conclusion = concludeCallIssue({
			issueType: 'audio-concealment',
			affectedClients: 4,
			totalClients: 5,
			onsetBurst: false,
			publishedTrackId: 'track-1',
		});

		expect(conclusion.faultDomain).toBe('published-track');
		expect(conclusion.summary).toContain('track-1');
		expect(conclusion.recommendation).toMatch(/uplink|forwarding/i);
	});

	it('attributes a call-wide group to the call', () => {
		const conclusion = concludeCallIssue({
			issueType: 'congestion',
			affectedClients: 5,
			totalClients: 8,
			onsetBurst: true,
		});

		expect(conclusion.faultDomain).toBe('call');
		expect(conclusion.summary).toMatch(/call/i);
	});

	it('attributes a lone client to its own endpoint', () => {
		const conclusion = concludeCallIssue({
			issueType: 'congestion',
			affectedClients: 1,
			totalClients: 8,
			onsetBurst: false,
		});

		expect(conclusion.faultDomain).toBe('endpoint');
	});
});
