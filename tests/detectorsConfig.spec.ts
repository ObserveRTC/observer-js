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

	it('honours addCallDetector/removeCallDetector for every call created from then on', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.addCallDetector('unconsumed-track-detector');
		observer.accept(sample('a', 1000, 'call-1'));

		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toContain('unconsumed-track-detector');

		observer.removeCallDetector('unconsumed-track-detector');
		observer.accept(sample('b', 1000, 'call-2'));

		// Editing the config doesn't touch calls already open — only calls created from now on.
		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toContain('unconsumed-track-detector');
		expect(observer.getObservedCall('call-2')!.detectors.listOfNames).not.toContain('unconsumed-track-detector');

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
