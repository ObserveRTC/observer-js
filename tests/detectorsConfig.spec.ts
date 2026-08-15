import { Observer } from '../src/Observer';
import { detectorSlot } from '../src/detectors/DetectorsConfig';
import type { ClientSample } from '../src/schema/ClientSample';
import { defaultCallDetectorsConfig, defaultObserverDetectorsConfig } from '../src/Observer';

/**
 * The three-state config contract: `undefined` -> defaults, object -> overrides, `null` -> not
 * created. The distinction between the last two is the whole point, so it is asserted directly
 * rather than inferred from behaviour.
 */

const sample = (clientId: string, timestamp: number): ClientSample => ({
	callId: 'call-1',
	clientId,
	timestamp,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
} as ClientSample);

describe('detectorSlot', () => {
	it('treats undefined as "create with defaults" and null as "do not create"', () => {
		expect(detectorSlot(undefined)).toEqual({});
		expect(detectorSlot(null)).toBeNull();
		expect(detectorSlot({ minClients: 9 })).toEqual({ minClients: 9 });
	});
});

describe('default detector configs', () => {
	// The point of the tables in `Observer.ts` is that they are the ONLY place a default lives. If a
	// detector reintroduced its own `defaultConfig`, editing the table would stop having any effect —
	// so this asserts the table is what an auto-created detector actually runs with.
	it('is what an auto-created detector runs with', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none', callDetectors: null });
		const [ detector ] = (observer.detectors as unknown as { _detectors: { name: string, _config: unknown }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');

		// `_config` is private; reading it here is deliberate — this test exists to catch the shipped
		// defaults drifting away from the table, which no public surface would reveal.
		expect(detector._config).toEqual(defaultObserverDetectorsConfig.concurrentIssueDetector);

		observer.close();
	});

	// Naming one key must not drop the rest — the factory merges the override over the table.
	it('merges an override over the table rather than replacing it', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			callDetectors: null,
			observerDetectors: { concurrentIssueDetector: { minAffectedCalls: 7 } },
		});
		const [ detector ] = (observer.detectors as unknown as { _detectors: { name: string, _config: Record<string, unknown> }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');

		expect(detector._config.minAffectedCalls).toBe(7);
		expect(detector._config.cooldownMs).toBe(defaultObserverDetectorsConfig.concurrentIssueDetector.cooldownMs);

		observer.close();
	});

	// The two tables intentionally share one object for the detector that runs at both scopes.
	it('shares the concurrent-issue defaults between the two scopes', () => {
		expect(defaultObserverDetectorsConfig.concurrentIssueDetector)
			.toBe(defaultCallDetectorsConfig.concurrentIssueDetector);
	});
});

describe('observer-scoped detector auto-creation', () => {
	it('creates every observer detector by default', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });

		expect(observer.detectors.listOfNames).toEqual(expect.arrayContaining([
			'concurrent-issue-detector',
			'turn-server-health-detector',
			'turn-server-outage-detector',
		]));

		observer.close();
	});

	it('skips only the detectors explicitly set to null', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			observerDetectors: {
				turnServerOutageDetector: null,
			},
		});

		expect(observer.detectors.listOfNames).toContain('turn-server-health-detector');
		expect(observer.detectors.listOfNames).not.toContain('turn-server-outage-detector');

		observer.close();
	});

	it('creates none when the whole group is null', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			observerDetectors: null,
		});

		expect(observer.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('passes overrides through to the detector', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			observerDetectors: { turnServerHealthDetector: { minClientsPerServer: 999 } },
		});

		// With an unreachable threshold the detector must exist but never raise.
		const issues: unknown[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));
		observer.update();

		expect(observer.detectors.listOfNames).toContain('turn-server-health-detector');
		expect(issues).toHaveLength(0);

		observer.close();
	});
});

describe('call-scoped detector auto-creation', () => {
	it('creates the call detectors for every call by default', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });

		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(call.detectors.listOfNames).toEqual(expect.arrayContaining([
			'concurrent-issue-detector',
			'issue-fan-out-detector',
			'track-delivery-mismatch-detector',
			'unconsumed-track-detector',
			'ice-disruption-detector',
		]));

		// The RTCP check is a validator, not a detector — it settles instead of running forever.
		expect(call.detectors.listOfNames).not.toContain('worst-receiver-contagion-detector');

		observer.close();
	});

	it('honours callDetectors on the observer for every call it creates', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			callDetectors: {
				iceDisruptionDetector: null,
				unconsumedTrackDetector: null,
			},
		});

		observer.accept(sample('a', 1000));

		const names = observer.getObservedCall('call-1')!.detectors.listOfNames;

		expect(names).toContain('issue-fan-out-detector');
		expect(names).not.toContain('ice-disruption-detector');
		expect(names).not.toContain('unconsumed-track-detector');

		observer.close();
	});

	it('creates none when callDetectors is null', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			callDetectors: null,
		});

		observer.accept(sample('a', 1000));

		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('lets a single call override the observer default', () => {
		const observer = new Observer({
			updatePolicy: 'none',
			defaultCallUpdatePolicy: 'none',
			callDetectors: null,
		});

		// The per-call value replaces the observer's wholesale; it is not merged into it. Naming one
		// key does NOT disable the others — every unnamed slot is `undefined`, so it still gets its
		// defaults. Disabling is always explicit, per key or via `callDetectors: null`.
		observer.createObservedCall({ callId: 'special', detectors: { iceDisruptionDetector: { minClients: 99 } } });
		observer.accept(sample('a', 1000)); // creates 'call-1' with the observer default (none)

		const special = observer.getObservedCall('special')!.detectors.listOfNames;

		expect(special).toContain('ice-disruption-detector');
		expect(special).toContain('issue-fan-out-detector');
		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('a call built directly, outside the observer, gets no auto-created detectors', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });
		const call = observer.createObservedCall({ callId: 'c', detectors: null })!;

		expect(call.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('releases auto-created detectors when the call closes', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });

		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(0 < call.detectors.listOfNames.length).toBe(true);

		call.close();

		expect(call.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('stays quiet on ordinary, healthy traffic', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });
		const issues: unknown[] = [];

		observer.on('call-issue', ({ issue }) => issues.push(issue));
		observer.on('observer-issue', ({ issue }) => issues.push(issue));

		for (let tick = 1; tick <= 10; tick++) {
			for (const clientId of [ 'a', 'b', 'c', 'd' ]) observer.accept(sample(clientId, tick * 1000));
			observer.getObservedCall('call-1')?.update();
			observer.update();
		}

		// Defaults must not fire on a call where nothing is wrong — otherwise "on by default" would
		// be unusable.
		expect(issues).toHaveLength(0);

		observer.close();
	});
});
