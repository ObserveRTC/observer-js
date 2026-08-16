import { Observer } from '../src/Observer';
import { createDefaultMediasoupRemoteTrackResolverFactory } from '../src/resolvers/RemoteTrackResolverFactories';
import { LOWEST_COMMON_DENOMINATOR_ISSUE } from '../src/validators/SimulcastReceiverValidator';
import type { ValidationReport } from '../src/validators/Validator';
import type { ClientSample } from '../src/schema/ClientSample';


const PRODUCER = 'P';
const TICK_MS = 1_000;

/** Cumulative bytes after `n` ticks at the given per-tick bitrates (bps, 1s ticks). */
function cumulativeBytes(bitratesBps: number[], upto: number): number {
	let bytes = 0;

	for (let i = 0; i < upto; i++) bytes += bitratesBps[i] / 8;

	return bytes;
}

function publisherSample(tick: number, bitrates: number[]): ClientSample {
	const timestamp = 1_000 + (tick * TICK_MS);

	return {
		callId: 'call-1',
		clientId: 'A',
		timestamp,
		peerConnections: [ {
			peerConnectionId: 'pcA',
			mediaSources: [ { timestamp, id: 'msA', kind: 'video', trackIdentifier: 'tA' } ],
			outboundRtps: [ {
				timestamp, id: 'outA', ssrc: 1, kind: 'video', mediaSourceId: 'msA',
				bytesSent: cumulativeBytes(bitrates, tick), packetsSent: tick * 100,
			} ],
			outboundTracks: [ { timestamp, id: 'tA', kind: 'video', attachments: { producerId: PRODUCER } } ],
		} ],
	} as ClientSample;
}

function receiverSample(clientId: string, tick: number, bitrates: number[]): ClientSample {
	const timestamp = 1_000 + (tick * TICK_MS);

	return {
		callId: 'call-1',
		clientId,
		timestamp,
		peerConnections: [ {
			peerConnectionId: `pc${clientId}`,
			inboundRtps: [ {
				timestamp, id: `in${clientId}`, ssrc: 1, kind: 'video', trackIdentifier: `t${clientId}`,
				bytesReceived: cumulativeBytes(bitrates, tick), packetsReceived: tick * 100, packetsLost: 0,
			} ],
			inboundTracks: [ {
				timestamp, id: `t${clientId}`, kind: 'video',
				attachments: { producerId: PRODUCER, consumerId: `c${clientId}` },
			} ],
		} ],
	} as ClientSample;
}

function newObserver() {
	const observer = new Observer({
		createRemoteTrackResolver: createDefaultMediasoupRemoteTrackResolverFactory(),
		autoUpdateOnCallUpdate: false,
		// No isolation config needed: a fresh Observer starts with zero detectors — nothing is
		// created implicitly, so only what a test explicitly registers can raise.
	});

	// Pre-create the call with client-driven auto-update disabled too, so `accept()` (which would
	// otherwise create it with the default `autoUpdateOnClientUpdate: true`) reuses this one.
	observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false });

	return observer;
}

/** Drive `ticks` rounds of samples and run the detector after each. */
function run(
	observer: Observer,
	ticks: number,
	profiles: { publisher: number[], receivers: Record<string, number[]> },
) {
	const call = observer.getObservedCall('call-1')!;

	for (let tick = 0; tick <= ticks; tick++) {
		observer.accept(publisherSample(tick, profiles.publisher));
		for (const [ clientId, bitrates ] of Object.entries(profiles.receivers)) {
			observer.accept(receiverSample(clientId, tick, bitrates));
		}
		if (0 < tick) observer.update();
	}

	return call;
}

const TICKS = 14;

/** A profile repeated to `TICKS` length, so a run can span several opportunity windows. */
const repeat = (pattern: number[]) => Array.from({ length: TICKS + 1 }, (_, i) => pattern[i % pattern.length]);

const STEADY = repeat([ 8_000_000 ]);
/** A receiver collapsing well below the median — the outlier that makes the check possible. */
const COLLAPSING = repeat([ 2_000_000, 1_600_000, 1_200_000, 800_000, 400_000 ]);

/** The publisher follows the collapsing receiver: RTCP is being relayed. */
const CONTAGION = {
	publisher: repeat([ 8_000_000, 6_400_000, 4_800_000, 3_200_000, 1_600_000 ]),
	receivers: { B: STEADY, C: STEADY, D: COLLAPSING },
};

/** An outlier exists (so the check CAN run) but the publisher ignores it — evidence of a pass. */
const HEALTHY_WITH_OUTLIER = {
	publisher: STEADY,
	receivers: { B: STEADY, C: STEADY, D: COLLAPSING },
};


/**
 * One question: does the SFU pick layers per receiver, or does one bad receiver drag the publisher
 * down for everyone?
 *
 *  - it must be able to conclude the good case, and only on evidence;
 *  - it FINISHES — reports once, then the observer drops it;
 *  - "never tested" must not read as a pass.
 */
describe('SimulcastReceiverValidator', () => {
	/** Start the validator and capture the single report it eventually emits. */
	function start(observer: Observer, config: Partial<{ minSamples: number, minChecks: number }> = {}) {
		const reports: ValidationReport[] = [];

		observer.on('validation-ready', ({ report }) => reports.push(report));
		observer.addValidator('simulcast-receivers', config);

		return reports;
	}

	it('reports `layer-decided-lowest-common-denominator` when a publisher follows its worst receiver', () => {
		const observer = newObserver();
		const issues: { type: string }[] = [];

		observer.on('observer-issue', ({ issue }) => issues.push(issue));
		observer.accept(publisherSample(0, []));

		const reports = start(observer, { minSamples: 4 });

		run(observer, TICKS, CONTAGION);

		expect(reports).toHaveLength(1);
		const [ report ] = reports;

		expect(report.ready).toBe(true);
		if (!report.ready) throw new Error('unreachable');
		expect(report.verdict).toBe('layer-decided-lowest-common-denominator');
		expect(issues.some((i) => i.type === LOWEST_COMMON_DENOMINATOR_ISSUE)).toBe(true);

		observer.close();
	});

	it('reports `layer-decided-per-receiver` after enough checks where an outlier was ignored', () => {
		const observer = newObserver();

		observer.accept(publisherSample(0, []));

		const reports = start(observer, { minSamples: 4, minChecks: 2 });

		run(observer, TICKS, HEALTHY_WITH_OUTLIER);

		expect(reports).toHaveLength(1);
		const [ report ] = reports;

		if (!report.ready) throw new Error('expected a decided report');
		expect(report.verdict).toBe('layer-decided-per-receiver');
		expect(2).toBeLessThanOrEqual(report.checks as number);

		observer.close();
	});

	// The point of counting checks: a fleet where nobody has a bad downlink has NOT been verified.
	it('never finishes while no outlier appears — untested is not the same as fine', () => {
		const observer = newObserver();

		observer.accept(publisherSample(0, []));

		const reports = start(observer, { minSamples: 4 });

		run(observer, TICKS, { publisher: STEADY, receivers: { B: STEADY, C: STEADY, D: STEADY } });

		expect(reports).toHaveLength(0);
		expect(observer.validators.size).toBe(1);   // still running, still knows nothing

		observer.close();
	});

	it('removes itself once it reports, and stops working', () => {
		const observer = newObserver();

		observer.accept(publisherSample(0, []));

		const reports = start(observer, { minSamples: 4, minChecks: 1 });

		run(observer, TICKS, HEALTHY_WITH_OUTLIER);

		expect(reports).toHaveLength(1);
		expect(observer.validators.size).toBe(0);

		// Further evidence — even a failing profile — produces nothing; it is gone.
		run(observer, TICKS, CONTAGION);
		expect(reports).toHaveLength(1);

		observer.close();
	});

	it('re-checks by starting another one, which is what a deploy should do', () => {
		const observer = newObserver();

		observer.accept(publisherSample(0, []));

		const reports = start(observer, { minSamples: 4, minChecks: 1 });

		run(observer, TICKS, HEALTHY_WITH_OUTLIER);
		expect(reports).toHaveLength(1);

		observer.addValidator('simulcast-receivers', { minSamples: 4, minChecks: 1 });
		run(observer, TICKS, CONTAGION);

		expect(reports).toHaveLength(2);
		if (!reports[1].ready) throw new Error('expected a decided report');
		expect(reports[1].verdict).toBe('layer-decided-lowest-common-denominator');

		observer.close();
	});

	it('finishes `inconclusive` when cancelled, so nothing waits forever', () => {
		const observer = newObserver();
		const reports = start(observer);

		observer.accept(publisherSample(0, []));
		[ ...observer.validators ][0].cancel();

		expect(reports).toHaveLength(1);
		const [ report ] = reports;

		if (!report.ready) throw new Error('expected a decided report');
		expect(report.verdict).toBe('inconclusive');
		expect(report.checks).toBe(0);
		expect(observer.validators.size).toBe(0);

		observer.close();
	});

	// Closing the observer must free anything waiting on a verdict rather than leaving it hanging.
	it('finishes `inconclusive` when the observer closes', () => {
		const observer = newObserver();
		const reports = start(observer);

		observer.accept(publisherSample(0, []));
		observer.close();

		expect(reports).toHaveLength(1);
		if (!reports[0].ready) throw new Error('expected a decided report');
		expect(reports[0].verdict).toBe('inconclusive');
	});

	it('is not started by default — a validator is an explicit, one-shot check', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.validators.size).toBe(0);

		observer.close();
	});
});

/**
 * Cancelling a running validation.
 *
 * Cancelling is not silent discarding: the validator finishes `inconclusive` with the reason,
 * emits `validation-ready` like any other completion, and removes itself. Anything waiting on a
 * verdict is freed, and "we stopped asking" stays distinguishable from "we asked and learned
 * nothing" — which is the whole reason `inconclusive` carries a reason at all.
 */
describe('cancelling a validation', () => {
	it('cancels by name, reporting inconclusive with the reason given', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const reports: { validator: string, report: Record<string, unknown> }[] = [];

		observer.on('validation-ready', ({ validator, report }) => reports.push({ validator, report: report as never }));

		observer.addValidator('simulcast-receivers');

		expect(observer.cancelValidator('simulcast-receivers', 'sfu redeployed')).toBe(1);

		expect(reports).toHaveLength(1);
		expect(reports[0].validator).toBe('simulcast-receivers');
		expect(reports[0].report).toMatchObject({
			ready: true,
			verdict: 'inconclusive',
			reason: 'sfu redeployed',
			checks: 0,
		});
		// It removed itself, exactly as a validator that decided on its own would have.
		expect(observer.validators.size).toBe(0);

		observer.close();
	});

	// `observer.validators` is where the running instances live, since `addValidator` is chainable.
	it('cancels one specific instance by handle', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		observer
			.addValidator('simulcast-receivers')
			.addValidator('codec-consistency');

		const simulcast = [ ...observer.validators ].find((validator) => validator.name === 'simulcast-receivers')!;

		expect(observer.cancelValidator(simulcast, 'not needed')).toBe(1);
		expect([ ...observer.validators ].map((validator) => validator.name)).toEqual([ 'codec-consistency' ]);

		observer.close();
	});

	it('reports 0 for a validator that is not running', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });

		expect(observer.cancelValidator('codec-consistency')).toBe(0);

		observer.close();
	});

	// A second cancel must not emit a second `validation-ready` for something already dropped.
	it('is idempotent', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		let emitted = 0;

		observer.on('validation-ready', () => ++emitted);

		observer.addValidator('simulcast-receivers');

		const validator = [ ...observer.validators ][0];

		expect(observer.cancelValidator(validator, 'first')).toBe(1);
		expect(observer.cancelValidator(validator, 'second')).toBe(0);
		expect(emitted).toBe(1);

		observer.close();
	});

	it('closing the observer cancels what is still running, with a reason', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		const reports: Record<string, unknown>[] = [];

		observer.on('validation-ready', ({ report }) => reports.push(report as never));

		observer.addValidator('remote-track-resolver');
		observer.close();

		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({ verdict: 'inconclusive', reason: 'observer closed' });
	});
});
