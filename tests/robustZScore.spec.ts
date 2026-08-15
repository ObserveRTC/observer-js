import { median, medianAbsoluteDeviation, robustZScore } from '../src/utils/stats';

/**
 * These tests double as the worked examples for `robustZScore`.
 *
 * The values are "share of clients reporting congestion", one entry per 10 s bucket — i.e. exactly
 * what `SfuCongestionDetector` feeds it. The question being asked is always the same: *is the latest
 * bucket unlike the ones before it?*
 */

/** A healthy fleet: a couple of percent of clients unhappy at any moment. */
const HEALTHY_BASELINE = [ 0.02, 0.01, 0.03, 0.04, 0.02 ];

/** The same fleet, except one earlier bucket was a real incident. */
const BASELINE_WITH_PAST_INCIDENT = [ 0.02, 0.01, 0.03, 0.04, 0.02, 0.40 ];

/** Classic mean/stddev z-score, for comparison only. Not exported by the library, and that is the point. */
function classicZScore(value: number, baseline: number[]): number {
	const mean = baseline.reduce((sum, entry) => sum + entry, 0) / baseline.length;
	const variance = baseline.reduce((sum, entry) => sum + ((entry - mean) ** 2), 0) / baseline.length;

	return variance === 0 ? Infinity : (value - mean) / Math.sqrt(variance);
}

describe('robustZScore: reading the scale', () => {
	it('scores an ordinary bucket low and a spike high', () => {
		expect(median(HEALTHY_BASELINE)).toBeCloseTo(0.02, 5);
		expect(medianAbsoluteDeviation(HEALTHY_BASELINE)).toBeCloseTo(0.01, 5);

		// The scale is 1.4826 * MAD ~= 0.0148, so one "sigma" is about one and a half percent.
		const ordinary = robustZScore(0.03, HEALTHY_BASELINE) as number;
		const spike = robustZScore(0.25, HEALTHY_BASELINE) as number;

		expect(ordinary).toBeCloseTo(0.67, 1);
		expect(spike).toBeGreaterThan(10);
	});

	it('scores a value below the baseline negatively — it is a signed distance, not a magnitude', () => {
		expect(robustZScore(0.005, HEALTHY_BASELINE) as number).toBeLessThan(0);
	});

	it('returns undefined for an empty baseline, because there is nothing to compare against', () => {
		expect(robustZScore(0.25, [])).toBeUndefined();
	});
});

describe('robustZScore: why median/MAD rather than mean/stddev', () => {
	it('one past incident in the baseline does not hide the next one', () => {
		// This is the entire reason the function exists. Add a single 40% bucket to the history and a
		// mean-based score stops being able to see a genuine 25% spike, because that one incident
		// inflated both the centre and the spread. Median and MAD barely move.
		const robust = robustZScore(0.25, BASELINE_WITH_PAST_INCIDENT) as number;
		const classic = classicZScore(0.25, BASELINE_WITH_PAST_INCIDENT);

		expect(median(BASELINE_WITH_PAST_INCIDENT)).toBeCloseTo(0.025, 5);
		expect(medianAbsoluteDeviation(BASELINE_WITH_PAST_INCIDENT)).toBeCloseTo(0.01, 5);
		expect(robust).toBeGreaterThan(10);

		// The mean climbed to ~0.087 and the stddev to ~0.14, so the spike reads as unremarkable.
		expect(classic).toBeLessThan(1.5);
	});

	it('agrees with the classic score when the baseline is clean', () => {
		// Robustness is not a different answer, it is the same answer that survives contamination.
		const robust = robustZScore(0.25, HEALTHY_BASELINE) as number;
		const classic = classicZScore(0.25, HEALTHY_BASELINE);

		expect(robust).toBeGreaterThan(10);
		expect(classic).toBeGreaterThan(10);
	});
});

describe('robustZScore: the flat-baseline case', () => {
	it('reads any increase over a perfectly quiet fleet as Infinity', () => {
		// MAD is 0, so there is no scale to divide by. `Infinity` is the honest answer: this has
		// literally no precedent. It is also not an edge case — a fleet with no congestion for five
		// straight buckets is the normal state of a healthy deployment.
		expect(robustZScore(0.10, [ 0, 0, 0, 0, 0 ])).toBe(Infinity);
		expect(robustZScore(0.001, [ 0, 0, 0, 0, 0 ])).toBe(Infinity);
	});

	it('reads no change over a flat baseline as 0, not as an error', () => {
		expect(robustZScore(0, [ 0, 0, 0, 0, 0 ])).toBe(0);
		expect(robustZScore(0.02, [ 0.02, 0.02, 0.02 ])).toBe(0);
		// Below a flat baseline is also 0 — indistinguishable from the baseline, not a negative spike.
		expect(robustZScore(0.01, [ 0.02, 0.02, 0.02 ])).toBe(0);
	});

	it('is why a caller must gate on practical significance as well', () => {
		// One client out of a thousand on a fleet that has been silent scores Infinity, which clears
		// any finite z threshold. Statistically that is correct and it is still not worth a page —
		// `SfuCongestionDetector` additionally requires `minAffectedClients` and a minimum absolute
		// increase, and those are what stop this from waking someone.
		const oneClientOfAThousand = 1 / 1000;

		expect(robustZScore(oneClientOfAThousand, [ 0, 0, 0, 0, 0 ])).toBe(Infinity);
		expect(oneClientOfAThousand).toBeLessThan(0.05);
	});
});
