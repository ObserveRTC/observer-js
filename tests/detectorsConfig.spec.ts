import { Observer } from '../src/Observer';
import type { ClientSample } from '../src/schema/ClientSample';

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

describe('default detector configs', () => {
	// Each detector now owns its defaults inside its own constructor (`{ ...defaults, ...config }`),
	// rather than in a central table. This pins the shipped defaults for `concurrent-issue-detector`
	// so a change to them is deliberate rather than accidental.
	it('is what an auto-created detector runs with', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false, callDetectors: null });
		const [ detector ] = (observer.detectors as unknown as { _detectors: { name: string, _config: unknown }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');

		// `_config` is private; reading it here is deliberate — this test exists to catch the shipped
		// defaults drifting away from what's documented, which no public surface would reveal.
		expect(detector._config).toEqual({
			issueTypes: [],
			minClients: 3,
			minAffectedClients: 3,
			affectedRatioThreshold: 0.5,
			minAffectedCalls: 2,
			affectedCallRatioThreshold: 0,
			onsetBurstWindowInMs: 2_000,
			cooldownMs: 60_000,
		});

		observer.close();
	});

	// Naming one key must not drop the rest — the constructor merges the override over its defaults.
	it('merges an override over the constructor defaults rather than replacing them', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			callDetectors: null,
			observerDetectors: { 'concurrent-issue-detector': { minAffectedCalls: 7 } },
		});
		const [ detector ] = (observer.detectors as unknown as { _detectors: { name: string, _config: Record<string, unknown> }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');

		expect(detector._config.minAffectedCalls).toBe(7);
		expect(detector._config.cooldownMs).toBe(60_000);

		observer.close();
	});

	// The same detector class is used at both scopes, so with no overrides at either, the defaults it
	// produces must be identical regardless of which scope constructed it.
	it('produces the same defaults whether created at observer or call scope', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;
		const [ observerDetector ] = (observer.detectors as unknown as { _detectors: { name: string, _config: unknown }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');
		const [ callDetector ] = (call.detectors as unknown as { _detectors: { name: string, _config: unknown }[] })._detectors
			.filter((d) => d.name === 'concurrent-issue-detector');

		expect(callDetector._config).toEqual(observerDetector._config);

		observer.close();
	});
});

describe('observer-scoped detector auto-creation', () => {
	it('creates every observer detector by default', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.detectors.listOfNames).toEqual(expect.arrayContaining([
			'concurrent-issue-detector',
			'turn-server-health-detector',
			'turn-server-outage-detector',
		]));

		observer.close();
	});

	it('skips only the detectors explicitly set to null', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			observerDetectors: {
				'turn-server-outage-detector': null,
			},
		});

		expect(observer.detectors.listOfNames).toContain('turn-server-health-detector');
		expect(observer.detectors.listOfNames).not.toContain('turn-server-outage-detector');

		observer.close();
	});

	it('creates none when the whole group is null', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			observerDetectors: null,
		});

		expect(observer.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('passes overrides through to the detector', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			observerDetectors: { 'turn-server-health-detector': { minClientsPerServer: 999 } },
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
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(call.detectors.listOfNames).toEqual(expect.arrayContaining([
			'concurrent-issue-detector',
			'issue-fan-out-detector',
			'track-delivery-mismatch-detector',
			'unconsumed-track-detector',
		]));

		// `ice-disruption-detector` correlates across a call's clients, but it is observer-scoped now
		// (it takes an `Observer`, not an `ObservedCall`) — it never runs as a call detector.
		expect(call.detectors.listOfNames).not.toContain('ice-disruption-detector');

		// The RTCP check is a validator, not a detector — it settles instead of running forever.
		expect(call.detectors.listOfNames).not.toContain('worst-receiver-contagion-detector');

		observer.close();
	});

	it('honours callDetectors on the observer for every call it creates', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			callDetectors: {
				'unconsumed-track-detector': null,
			},
		});

		observer.accept(sample('a', 1000));

		const names = observer.getObservedCall('call-1')!.detectors.listOfNames;

		expect(names).toContain('issue-fan-out-detector');
		expect(names).not.toContain('unconsumed-track-detector');

		observer.close();
	});

	it('creates none when callDetectors is null', () => {
		const observer = new Observer({
			autoUpdateOnCallUpdate: false,
			callDetectors: null,
		});

		observer.accept(sample('a', 1000));

		expect(observer.getObservedCall('call-1')!.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('releases auto-created detectors when the call closes', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer.accept(sample('a', 1000));

		const call = observer.getObservedCall('call-1')!;

		expect(0 < call.detectors.listOfNames.length).toBe(true);

		call.close();

		expect(call.detectors.listOfNames).toHaveLength(0);

		observer.close();
	});

	it('stays quiet on ordinary, healthy traffic', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
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
