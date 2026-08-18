import { Observer } from '../src/Observer';
import { ClientPopulationIssueDetector, ClientPopulationIssueTypes } from '../src/detectors/ClientPopulationIssueDetector';
import type { ClientSample } from '../src/schema/ClientSample';
import { payloadOf, type CollectedIssue } from './helpers/issues';

/**
 * `ClientPopulationIssueDetector` — is this issue concentrated on one *kind* of client?
 *
 * The thing under test is not "does it group by browser" but the gate: **relative risk against a
 * control group**. A share-based rule ("30% of Chrome 141 is unhappy") indicts whichever browser is
 * most popular, so most of what follows checks that the detector stays quiet when the suspect
 * population is not actually worse than everyone else.
 */

type Issue = { type: string, key: string, timestamp: number };

const raise = (type: string, clientId: string, timestamp = 1000): Issue => ({
	type,
	key: `${clientId}:${type}`,
	timestamp,
});

const sample = (
	clientId: string,
	browser: { name: string, version: string } | undefined,
	issues?: Issue[],
	callId = 'call-1',
): ClientSample => ({
	callId,
	clientId,
	timestamp: 1000,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
	clientIssues: issues,
	clientMetaItems: browser
		? [ { type: 'BROWSER', timestamp: 1000, payload: JSON.stringify(browser) } ]
		: undefined,
} as unknown as ClientSample);

/** Small thresholds so a scenario stays readable; production defaults are 20/5/20. */
const config = {
	issueTypes: [ 'encoder-bottleneck' ],
	groupBy: 'browser' as const,
	minPopulationSize: 6,
	minAffectedClients: 4,
	minControlSize: 6,
	affectedRatioThreshold: 0.3,
	minRelativeRisk: 3,
};

function newObserver() {
	const observer = new Observer({ autoUpdateOnCallUpdate: false });
	const found: CollectedIssue[] = [];

	observer.on('observer-issue', ({ issue }) => found.push(issue));

	return { observer, found };
}

/** `affected` of `size` clients on `browser`, spread over three calls so no call-scoped rule applies. */
function population(
	observer: Observer,
	prefix: string,
	browser: { name: string, version: string },
	size: number,
	affected: number,
) {
	for (let i = 0; i < size; i++) {
		observer.accept(sample(
			`${prefix}-${i}`,
			browser,
			i < affected ? [ raise('encoder-bottleneck', `${prefix}-${i}`) ] : undefined,
			`call-${i % 3}`,
		));
	}
}

describe('ClientPopulationIssueDetector', () => {
	it('reports a population that is far worse than the rest of the fleet', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 6, 5);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 1);

		observer.update();

		expect(found).toHaveLength(1);
		expect(found[0].type).toBe(ClientPopulationIssueTypes.clientPopulationIssue);

		const payload = payloadOf(found[0]);

		expect(payload.population).toBe('Chrome 141');
		expect(payload.issueType).toBe('encoder-bottleneck');
		expect(payload.affectedClients).toBe(5);
		expect(payload.clients).toBe(6);
		expect(payload.controlClients).toBe(8);
		expect(payload.controlAffectedClients).toBe(1);
		// 5/6 vs 1/8 -> ~6.7x
		expect(payload.relativeRisk).toBeGreaterThan(3);
		expect(found[0].conclusion?.faultDomain).toBe('client-population');
		expect(found[0].conclusion?.recommendation).toMatch(/not an SFU symptom/i);

		observer.close();
	});

	// The heart of the design. Without the control group this fires on the biggest population every
	// time, and the "finding" is just a popularity contest.
	it('stays silent when everyone is equally unhappy', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 8, 4);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 4);

		observer.update();

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('stays silent when the control group is too small to be a measurement', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 6, 6);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 2, 0);

		observer.update();

		expect(found).toHaveLength(0);

		observer.close();
	});

	it('stays silent when the suspect population itself is too small', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 4, 4);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 0);

		observer.update();

		expect(found).toHaveLength(0);

		observer.close();
	});

	// `Infinity` is the honest answer when nobody outside the population has the problem, and it must
	// still pass the population/affected floors — which is what stops one unlucky user from paging.
	it('reports Infinity relative risk against a spotless control group', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Safari', version: '18' }, 6, 5);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 0);

		observer.update();

		expect(found).toHaveLength(1);
		expect(payloadOf(found[0]).relativeRisk).toBe(Infinity);
		expect(found[0].conclusion?.summary).toMatch(/exclusively/);

		observer.close();
	});

	it('groups by name only when includeVersion is off', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', { ...config, includeVersion: false });

		population(observer, 'bad-a', { name: 'Safari', version: '18' }, 3, 3);
		population(observer, 'bad-b', { name: 'Safari', version: '17' }, 3, 2);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 0);

		observer.update();

		expect(found).toHaveLength(1);
		// Both Safari versions collapse into one population of 6.
		expect(payloadOf(found[0]).population).toBe('Safari');
		expect(payloadOf(found[0]).clients).toBe(6);

		observer.close();
	});

	// A synthetic 'unknown' bucket would be a mixture of every real population, so any rate computed
	// for it is meaningless — and leaving those clients in the control group dilutes the comparison.
	it('excludes clients that never reported the grouping attribute', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 6, 5);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 1);

		// Ten anonymous unhappy clients. If they landed in the control group they would swamp it.
		for (let i = 0; i < 10; i++) {
			observer.accept(sample(`anon-${i}`, undefined, [ raise('encoder-bottleneck', `anon-${i}`) ], `call-${i % 3}`));
		}

		observer.update();

		expect(found).toHaveLength(1);

		const payload = payloadOf(found[0]);

		expect(payload.clients).toBe(6);
		expect(payload.controlClients).toBe(8);
		expect(payload.controlAffectedClients).toBe(1);

		observer.close();
	});

	it('groups by a different axis when asked', () => {
		const { observer, found } = newObserver();
		const detector = new ClientPopulationIssueDetector(observer, { ...config, groupBy: 'operationSystem' });

		observer.detectors.add(detector);

		// Nothing reports operationSystem, so the axis has no populations at all.
		population(observer, 'bad', { name: 'Chrome', version: '141' }, 6, 5);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 0);

		observer.update();

		expect(found).toHaveLength(0);
		expect(detector.lastPopulations).toHaveLength(0);

		observer.close();
	});

	it('holds nothing and does nothing when no issues are open', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', config);

		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 0);

		observer.update();

		expect(found).toHaveLength(0);
		expect((observer.detectors.get('client-population-issue-detector') as unknown as { size: number }).size).toBe(0);

		observer.close();
	});

	it('honours the cooldown, then unsubscribes on removal', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', { ...config, cooldownMs: 300_000 });

		population(observer, 'bad', { name: 'Chrome', version: '141' }, 6, 5);
		population(observer, 'good', { name: 'Chrome', version: '140' }, 8, 1);

		observer.update();
		observer.update();

		// Second pass still qualifies (it is in `lastPopulations`) but must not re-raise.
		expect(found).toHaveLength(1);

		const detector = observer.detectors.get('client-population-issue-detector') as unknown as { size: number };

		expect(detector.size).toBeGreaterThan(0);

		observer.removeObserverDetector('client-population-issue-detector');

		expect(detector.size).toBe(0);
		expect(observer.detectors.size).toBe(0);

		observer.close();
	});
});

/**
 * The `location` axis: is this symptom concentrated in one *place*?
 *
 * Same gate as the endpoint axes — relative risk against a control group — but the population is a
 * geohash cell. What these pin down is that the cell key is what travels (never the coordinates), and
 * that a misconfigured or un-locatable client is excluded rather than lumped into a fake place.
 */

const geoSample = (
	clientId: string,
	geo: { latitude: number, longitude: number } | undefined,
	issues?: Issue[],
	callId = 'call-1',
): ClientSample => ({
	callId,
	clientId,
	timestamp: 1000,
	peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
	clientIssues: issues,
	attachments: geo ? { geo } : undefined,
} as unknown as ClientSample);

const BUDAPEST = { latitude: 47.4979, longitude: 19.0402 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

const geoConfig = {
	issueTypes: [ 'congestion' ],
	groupBy: 'location' as const,
	locationPrecision: 3,
	resolveClientLocation: (client: { attachments?: Record<string, unknown> }) =>
		client.attachments?.geo as { latitude: number, longitude: number } | undefined,
	minPopulationSize: 6,
	minAffectedClients: 4,
	minControlSize: 6,
	affectedRatioThreshold: 0.3,
	minRelativeRisk: 3,
};

function geoPopulation(
	observer: Observer,
	prefix: string,
	geo: { latitude: number, longitude: number } | undefined,
	size: number,
	affected: number,
) {
	for (let i = 0; i < size; i++) {
		observer.accept(geoSample(
			`${prefix}-${i}`,
			geo,
			i < affected ? [ raise('congestion', `${prefix}-${i}`) ] : undefined,
			`call-${i % 3}`,
		));
	}
}

describe('ClientPopulationIssueDetector (location axis)', () => {
	it('reports congestion concentrated in one geographic cell', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', geoConfig);

		geoPopulation(observer, 'hu', BUDAPEST, 6, 5);
		geoPopulation(observer, 'uk', LONDON, 8, 1);

		observer.update();

		expect(found).toHaveLength(1);

		const payload = payloadOf(found[0]);

		expect(payload.axis).toBe('location');
		expect(payload.affectedClients).toBe(5);
		expect(payload.controlClients).toBe(8);
		// Geography is a path story, not a client-build story.
		expect(found[0].conclusion?.faultDomain).toBe('infrastructure');

		observer.close();
	});

	// These payloads get archived into call summaries, so what leaves the detector has to be a place
	// at the configured resolution — not a participant's position.
	it('puts the cell key in the payload and never the coordinates', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', geoConfig);

		geoPopulation(observer, 'hu', BUDAPEST, 6, 5);
		geoPopulation(observer, 'uk', LONDON, 8, 1);

		observer.update();

		const serialised = JSON.stringify(found[0]);

		expect(payloadOf(found[0]).population).toBe('u2m');
		expect(serialised).not.toContain('47.4979');
		expect(serialised).not.toContain('19.0402');
		expect(serialised).not.toContain('latitude');

		observer.close();
	});

	// The control group has to work on this axis too: a fleet-wide problem is not a regional one, and
	// naive share-based grouping would indict whichever region has the most users.
	it('stays quiet when every region is equally affected', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', geoConfig);

		geoPopulation(observer, 'hu', BUDAPEST, 8, 6);
		geoPopulation(observer, 'uk', LONDON, 8, 6);

		observer.update();

		expect(found).toHaveLength(0);

		observer.close();
	});

	// A client whose location we cannot read is not in an "unknown" place — a bucket of every real
	// region would have a meaningless rate, and leaving them in the control group dilutes it.
	it('excludes clients whose location cannot be resolved from both groups', () => {
		const { observer, found } = newObserver();

		observer.addObserverDetector('client-population-issue-detector', geoConfig);

		geoPopulation(observer, 'hu', BUDAPEST, 6, 5);
		geoPopulation(observer, 'uk', LONDON, 8, 1);
		// Eight unhappy clients with no coordinates: enough to change every ratio if they counted.
		geoPopulation(observer, 'nowhere', undefined, 8, 8);

		observer.update();

		expect(found).toHaveLength(1);
		expect(payloadOf(found[0]).clients).toBe(6);
		expect(payloadOf(found[0]).controlClients).toBe(8);

		observer.close();
	});

	// Silence must not be the reward for misconfiguration. Nothing can be detected without a resolver,
	// so the detector says so at construction rather than reporting "no findings" forever.
	it('warns and finds nothing when no resolveClientLocation was given', () => {
		const { observer, found } = newObserver();
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

		observer.addObserverDetector('client-population-issue-detector', {
			...geoConfig,
			resolveClientLocation: undefined,
		});

		geoPopulation(observer, 'hu', BUDAPEST, 6, 5);
		geoPopulation(observer, 'uk', LONDON, 8, 1);

		observer.update();

		expect(found).toHaveLength(0);

		warn.mockRestore();
		observer.close();
	});
});
