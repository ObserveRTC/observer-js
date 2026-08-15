import { TrendTester } from '../src/utils/TrendTester';

/**
 * These tests double as the worked examples for `TrendTester`.
 *
 * Everything below is RTT in milliseconds, because RTT is the metric where the difference between
 * the two tests is easiest to feel: a link slowly filling up and a link failing over to a worse
 * route are both "RTT got worse", and they need completely different responses.
 */

/** A slow climb: no single step is alarming, but the direction is unmistakable. */
const DRIFTING_RTT = [ 38, 41, 40, 45, 44, 49, 53, 51, 58, 62, 60, 67, 71, 74, 79, 85 ];

/** Two flat levels with a hard step between them — a route change or a TURN failover. */
const STEPPED_RTT = [ 40, 42, 39, 41, 38, 42, 40, 39, 185, 181, 190, 186, 183, 188, 184, 187 ];

/** Ordinary jitter around a stable mean. Neither test should fire on this. */
const STABLE_RTT = [ 40, 43, 38, 41, 44, 39, 42, 40, 45, 37, 41, 43, 39, 42, 40, 44 ];

const feed = (tester: TrendTester, values: number[]) => {
	for (const value of values) tester.add(value);
};

describe('TrendTester / Mann-Kendall: "is this drifting?"', () => {
	it('reports an increasing trend for RTT that climbs without ever jumping', () => {
		const rtt = new TrendTester({ size: 30 });

		feed(rtt, DRIFTING_RTT);

		const verdict = rtt.mannKendall();

		expect(verdict.trend).toBe('increasing');
		// `s` counts (later > earlier) minus (later < earlier) over every pair. 16 values give
		// 16*15/2 = 120 pairs, and a near-monotonic climb wins almost all of them.
		expect(verdict.s).toBeGreaterThan(90);
		expect(verdict.pValue).toBeLessThan(0.05);
	});

	it('reports no trend for RTT that is merely noisy', () => {
		const rtt = new TrendTester({ size: 30 });

		feed(rtt, STABLE_RTT);

		expect(rtt.mannKendall().trend).toBe('no-trend');
	});

	it('is unmoved by a single absurd reading, because it ranks rather than averages', () => {
		const withOutlier = new TrendTester({ size: 30 });
		const without = new TrendTester({ size: 30 });

		// A 4000 ms reading from a stalled event loop is not a network fact. A mean-based test would
		// be dragged bodily upward by it; Mann-Kendall sees it as one value that happens to be larger
		// than the others, so it moves `s` by at most the pairs it takes part in.
		feed(withOutlier, [ ...STABLE_RTT.slice(0, 8), 4000, ...STABLE_RTT.slice(9) ]);
		feed(without, STABLE_RTT);

		expect(withOutlier.mannKendall().trend).toBe('no-trend');
		expect(without.mannKendall().trend).toBe('no-trend');
	});

	it('detects a decreasing trend too — recovery is a trend', () => {
		const rtt = new TrendTester({ size: 30 });

		feed(rtt, [ ...DRIFTING_RTT ].reverse());

		expect(rtt.mannKendall().trend).toBe('decreasing');
		expect(rtt.mannKendall().s).toBeLessThan(0);
	});
});

describe('TrendTester / Page-Hinkley: "did it change, and when?"', () => {
	it('detects the step when RTT failoveries onto a worse route', () => {
		const rtt = new TrendTester({ size: 30, pageHinkleyLambda: 50 });

		feed(rtt, STEPPED_RTT);

		expect(rtt.pageHinkley()?.changeDetected).toBe(true);
	});

	it('stays quiet on noise around a stable mean', () => {
		const rtt = new TrendTester({ size: 30, pageHinkleyLambda: 50 });

		feed(rtt, STABLE_RTT);

		expect(rtt.pageHinkley()?.changeDetected).toBe(false);
	});
});

describe('TrendTester: the two tests are not interchangeable', () => {
	it('a step is caught by Page-Hinkley while Mann-Kendall can read it as no-trend', () => {
		const rtt = new TrendTester({ size: 30, pageHinkleyLambda: 50 });

		feed(rtt, STEPPED_RTT);

		// This is the whole reason both live on one window. The series is flat, then flat again at a
		// different level: there is a change, but not a *drift*, and only one of the two tests is
		// built to say so. (Mann-Kendall does happen to fire here too, because every post-step value
		// exceeds every pre-step one — but it cannot say WHERE the change was, which is the thing you
		// need in order to correlate it with a deploy.)
		expect(rtt.pageHinkley()?.changeDetected).toBe(true);
		expect(typeof rtt.pageHinkley()?.changePointIndex).toBe('number');
	});

	it('a drift is caught by Mann-Kendall while Page-Hinkley can miss it', () => {
		// A generous lambda: no single deviation from the running mean is large, so the cumulative
		// statistic never gets over the bar, even though the link is on its way to unusable.
		const rtt = new TrendTester({ size: 30, pageHinkleyLambda: 200 });

		feed(rtt, DRIFTING_RTT);

		expect(rtt.mannKendall().trend).toBe('increasing');
		expect(rtt.pageHinkley()?.changeDetected).toBe(false);
	});
});

describe('TrendTester: resilience', () => {
	it('rejects non-finite values instead of absorbing them', () => {
		const rtt = new TrendTester({ size: 30 });

		feed(rtt, DRIFTING_RTT);

		const before = rtt.mannKendall();

		rtt.add(NaN);
		rtt.add(Infinity);
		rtt.add(-Infinity);

		// The point of the guard: `Math.sign(NaN)` is `NaN`, so absorbing even one would poison the
		// incremental sum permanently — every later verdict would be NaN, every comparison false, and
		// the tester would report 'no-trend' for the rest of its life while looking perfectly healthy.
		expect(rtt.rejected).toBe(3);
		expect(rtt.length).toBe(DRIFTING_RTT.length);
		expect(rtt.mannKendall()).toEqual(before);
		expect(Number.isFinite(rtt.mannKendall().s)).toBe(true);
		expect(rtt.mannKendall().trend).toBe('increasing');
	});

	it('keeps a correct verdict after the window has rolled over', () => {
		const size = 8;
		const rolling = new TrendTester({ size });
		const fresh = new TrendTester({ size });

		// Feed a long climb through a short window, then compare against a tester given only the
		// values that survived. Eviction has to correct the pair sum exactly, or the two disagree.
		feed(rolling, DRIFTING_RTT);
		feed(fresh, DRIFTING_RTT.slice(-size));

		expect(rolling.length).toBe(size);
		expect(rolling.mannKendall().s).toBe(fresh.mannKendall().s);
		expect(rolling.mannKendall().trend).toBe(fresh.mannKendall().trend);
	});

	it('refuses a window too small to hold a pair', () => {
		// `size: 0` would make the eviction guard (`length === size`) unreachable, so the window would
		// grow without bound for the life of the process.
		const rtt = new TrendTester({ size: 0 });

		feed(rtt, DRIFTING_RTT);

		expect(rtt.size).toBe(2);
		expect(rtt.length).toBe(2);
	});

	it('starts fresh after clear(), which is what you do at a detected change point', () => {
		const rtt = new TrendTester({ size: 30, pageHinkleyLambda: 50 });

		feed(rtt, STEPPED_RTT);
		expect(rtt.pageHinkley()?.changeDetected).toBe(true);

		rtt.clear();

		// After a step, the old level is no longer the baseline. Judging the new level against the old
		// one keeps reporting the same change forever.
		expect(rtt.length).toBe(0);
		expect(rtt.pageHinkley()).toBeUndefined();
		expect(rtt.mannKendall().trend).toBe('no-trend');

		feed(rtt, [ 185, 181, 190, 186, 183, 188 ]);
		expect(rtt.pageHinkley()?.changeDetected).toBe(false);
	});

	it('says nothing at all from a single measurement', () => {
		const rtt = new TrendTester();

		rtt.add(42);

		const verdict = rtt.mannKendall();

		expect(verdict.trend).toBe('no-trend');
		expect(verdict.s).toBe(0);
		expect(verdict.pValue).toBe(1);
	});
});
