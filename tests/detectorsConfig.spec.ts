import { Observer } from '../src/Observer';
import type { ClientSample } from '../src/schema/ClientSample';

/**
 * Detector configuration used to be a three-state slot on `ObserverConfig`
 * (`undefined` -> defaults, object -> overrides, `null` -> not created), auto-populated for every
 * observer/call. That scheme, `DetectorSlot`, `OBSERVER_SCOPE_DETECTOR_NAMES` and
 * `CALL_SCOPE_DETECTOR_NAMES` are all gone: `ObserverConfig` carries no detector configuration at
 * all, and nothing is created implicitly. A fresh `Observer`/`ObservedCall` runs zero detectors until
 * the application asks for one via `addObserverDetector` / `addCallDetector` /
 * `observedCall.addDetector`.
 *
 * The old "default detector configs" suite (pinning the shipped defaults of a single, shared
 * `concurrent-issue-detector` used at both scopes, and asserting the two scopes produced identical
 * defaults) no longer applies either: that one class is gone, split into
 * `CallConcurrentIssueDetector` and `ObserverConcurrentIssueDetector`, which are different classes
 * with different config shapes (call scope has `minClients`/`affectedRatioThreshold`; observer scope
 * has `minAffectedCalls`/`affectedCallRatioThreshold` instead) — there is no shared default to compare.
 */

const sample = (clientId: string, timestamp: number, callId = 'call-1'): ClientSample => ({
	callId,
	clientId,
	timestamp,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
} as ClientSample);

describe('observer-scoped detectors', () => {
	it('creates none by default', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('builds the detector immediately when explicitly registered', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addObserverDetector('turn-server-health-detector');

		expect(observer.detectors.listOfNames).toContain('turn-server-health-detector');

		observer.close();
	});

	it('passes overrides through to the detector', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addObserverDetector('turn-server-health-detector', { minClientsPerServer: 999 });

		// With an unreachable threshold the detector must exist but never raise.
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));
		observer.update();

		expect(observer.detectors.listOfNames).toContain('turn-server-health-detector');
		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('call-scoped detectors', () => {
	it('creates none by default', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000));

		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('honours addCallDetector for every call created from then on', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000, 'call-1'));

		// Registered after call-1 opened, so call-1 never gets it.
		observer.addCallDetector('unconsumed-track-detector');
		observer.accept(sample('b', 1000, 'call-2'));

		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).not.toContain('unconsumed-track-detector');
		expect(observer.getObservedCall('call-2')!.detectors.listOfNames).toContain('unconsumed-track-detector');

		observer.close();
	});

	it('observedCall.addDetector adds a detector to one call, not to calls created afterwards', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000, 'call-1'));

		const call = observer.getObservedCall('call-1')!;

		call.addDetector('unconsumed-track-detector');
		expect(call.detectors.listOfNames).toContain('unconsumed-track-detector');

		observer.accept(sample('b', 1000, 'call-2'));
		expect(observer.getObservedCall('call-2')!.detectors.listOfNames).not.toContain('unconsumed-track-detector');

		observer.close();
	});

	it('releases detectors when the call closes', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('unconsumed-track-detector');
		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(0 < call.detectors.listOfNames.length).toBe(true);

		call.close();

		expect(call.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('stays quiet on ordinary, healthy traffic once registered explicitly', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const issues: unknown[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));
		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		observer.addCallDetector('unconsumed-track-detector');
		observer.addCallDetector('track-delivery-mismatch-detector');

		for (let tick = 1; tick <= 10; tick++) {
			for (const clientId of [ 'a', 'b', 'c', 'd' ]) observer.accept(sample(clientId, tick * 1000));
			observer.getObservedCall('call-1')?.update();
			observer.update();
		}

		// Nothing should fire on a call where nothing is wrong, even with real detectors registered.
		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('removing detectors by name', () => {
	it('removes an observer-scoped detector and reports how many went', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addObserverDetector('turn-server-health-detector');
		observer.addObserverDetector('turn-server-outage-detector');

		expect(observer.removeObserverDetector('turn-server-health-detector')).toBe(1);
		expect(observer.detectors.listOfNames).toEqual([ 'turn-server-outage-detector' ]);

		observer.close();
	});

	it('reports 0 for a name that was never registered', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.removeObserverDetector('turn-server-health-detector')).toBe(0);

		observer.close();
	});

	// A name can legitimately be registered more than once — `ClientPopulationIssueDetector` is meant
	// to be added once per `groupBy` axis. Removing "the first one" would leave the registry in a
	// state the caller cannot predict from the name they passed.
	// `add*` is chainable, so the registry — not the return value — is where instances live.
	it('is chainable', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.addObserverDetector('turn-server-health-detector')).toBe(observer);
		expect(observer.addValidator('codec-consistency')).toBe(observer);

		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(call.addDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] })).toBe(call);

		observer.close();
	});

	it('exposes its instances for listing and iteration', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer
			.addObserverDetector('turn-server-health-detector')
			.addObserverDetector('turn-server-outage-detector');

		expect(observer.detectors.instances).toHaveLength(2);
		expect([ ...observer.detectors ].map((detector) => detector.name)).toEqual([
			'turn-server-health-detector',
			'turn-server-outage-detector',
		]);
		expect(observer.detectors.has('turn-server-health-detector')).toBe(true);
		expect(observer.detectors.has('client-population-issue-detector')).toBe(false);

		observer.close();
	});

	// `instances` is a copy, so removing while iterating it visits everything. Handing out the live
	// array would make the most natural loop — "drop the ones that look like X" — skip entries.
	it('can be iterated while removing', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer
			.addObserverDetector('turn-server-health-detector')
			.addObserverDetector('turn-server-outage-detector')
			.addObserverDetector('sfu-congestion-detector');

		let visited = 0;

		for (const detector of observer.detectors.instances) {
			++visited;
			observer.detectors.remove(detector);
		}

		expect(visited).toBe(3);
		expect(observer.detectors.size).toBe(0);

		observer.close();
	});

	it('removes one specific instance from the registry, leaving its same-named sibling', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer
			.addObserverDetector('client-population-issue-detector', {
				issueTypes: [ 'cpulimitation' ], groupBy: 'browser',
			})
			.addObserverDetector('client-population-issue-detector', {
				issueTypes: [ 'cpulimitation' ], groupBy: 'operationSystem',
			});

		const [ byBrowser, byOs ] = observer.detectors.getAll('client-population-issue-detector');

		expect(observer.detectors.remove(byOs)).toBe(true);
		expect(observer.detectors.getAll('client-population-issue-detector')).toEqual([ byBrowser ]);

		observer.close();
	});

	it('reports false when the instance was never registered here', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const first = observer.createObservedCall({ callId: 'call-1' })!;
		const second = observer.createObservedCall({ callId: 'call-2' })!;

		first.addDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });

		const [ detector ] = first.detectors.getAll('call-concurrent-issue-detector');

		// Removing another call's detector must not silently claim success.
		expect(second.detectors.remove(detector)).toBe(false);
		expect(first.detectors.size).toBe(1);

		observer.close();
	});

	it('ignores an unknown name without registering anything', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addObserverDetector('nope' as never);
		observer.addValidator('nope' as never);

		expect(observer.detectors.size).toBe(0);
		expect(observer.validators.size).toBe(0);

		observer.close();
	});

	it('removes every instance sharing a name, not just the first', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addObserverDetector('client-population-issue-detector', {
			issueTypes: [ 'cpulimitation' ], groupBy: 'browser',
		});
		observer.addObserverDetector('client-population-issue-detector', {
			issueTypes: [ 'cpulimitation' ], groupBy: 'operationSystem',
		});

		expect(observer.detectors.listOfNames).toHaveLength(2);
		expect(observer.removeObserverDetector('client-population-issue-detector')).toBe(2);
		expect(observer.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('removes a detector from one call without touching the others', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });

		const first = observer.createObservedCall({ callId: 'call-1' })!;
		const second = observer.createObservedCall({ callId: 'call-2' })!;

		expect(first.removeDetector('call-concurrent-issue-detector')).toBe(1);
		expect(first.detectors.listOfNames).toHaveLength(0);
		expect(second.detectors.listOfNames).toEqual([ 'call-concurrent-issue-detector' ]);

		observer.close();
	});

	// The default is deliberately "everywhere": otherwise whether a detector runs depends on when a
	// call happened to join, which is not something anyone can reason about.
	it('removes a call detector from open calls as well as future ones', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });

		const open = observer.createObservedCall({ callId: 'call-1' })!;

		expect(observer.removeCallDetector('call-concurrent-issue-detector')).toBe(1);
		expect(open.detectors.listOfNames).toHaveLength(0);

		const later = observer.createObservedCall({ callId: 'call-2' })!;

		expect(later.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('can leave open calls alone when asked', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });

		const open = observer.createObservedCall({ callId: 'call-1' })!;

		expect(observer.removeCallDetector('call-concurrent-issue-detector', { includeOpenCalls: false })).toBe(0);
		expect(open.detectors.listOfNames).toEqual([ 'call-concurrent-issue-detector' ]);

		const later = observer.createObservedCall({ callId: 'call-2' })!;

		expect(later.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	// The one that actually matters. A removed detector that never unsubscribed keeps being handed
	// every matching issue for the life of the call — invisible, unbounded, and it would still be
	// "working" if you inspected it.
	it('unsubscribes the detector from the issue registry, so it stops being fed', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('call-concurrent-issue-detector', { issueTypes: [ 'congestion' ] });

		const call = observer.createObservedCall({ callId: 'call-1' })!;
		const detector = call.detectors.get('call-concurrent-issue-detector') as unknown as { size: number };


		observer.accept({
			...sample('alice', 1000),
			clientIssues: [ { type: 'congestion', key: 'alice:congestion', timestamp: 1000 } ],
		} as ClientSample);

		// Proves the subscription was live to begin with, so the assertion below means something.
		expect(detector.size).toBe(1);

		call.removeDetector('call-concurrent-issue-detector');

		// `close()` both unsubscribed and dropped what it held.
		expect(detector.size).toBe(0);
		expect(call.activeIssuesRegistry.size).toBe(1);

		observer.accept({
			...sample('bob', 2000),
			clientIssues: [ { type: 'congestion', key: 'bob:congestion', timestamp: 2000 } ],
		} as ClientSample);

		// The registry took bob's issue; the removed detector never saw it.
		expect(call.activeIssuesRegistry.size).toBe(2);
		expect(detector.size).toBe(0);

		observer.close();
	});
});
