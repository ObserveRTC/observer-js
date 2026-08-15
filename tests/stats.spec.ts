import { percentile, median, summarize, counterDelta, pageHinkley, mannKendall, mannKendallVerdict } from '../src/utils/stats';
import { SlidingWindow } from '../src/utils/SlidingWindow';

describe('stats utilities', () => {
	it('percentile interpolates and handles edges', () => {
		const values = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ];

		expect(percentile(values, 0)).toBe(1);
		expect(percentile(values, 1)).toBe(10);
		expect(percentile(values, 0.5)).toBeCloseTo(5.5);
		expect(percentile([ 42 ], 0.95)).toBe(42);
		expect(percentile([], 0.5)).toBeUndefined();
	});

	it('median resists outliers where mean does not', () => {
		// 9 healthy clients + 1 terrible one — the case a mean would hide.
		const rtts = [ 40, 41, 39, 40, 42, 38, 40, 41, 40, 1500 ];
		const s = summarize(rtts)!;

		expect(s.median).toBeCloseTo(40);
		expect(s.mean).toBeGreaterThan(180);
		expect(s.max).toBe(1500);
		expect(s.p95).toBeGreaterThan(s.p75);
		expect(s.count).toBe(10);
	});

	it('summarize returns undefined for empty input', () => {
		expect(summarize([])).toBeUndefined();
		expect(median([])).toBeUndefined();
	});

	it('counterDelta treats 0 as a valid baseline and survives resets', () => {
		expect(counterDelta(0, 5)).toBe(5);      // the bug this replaces: used to yield 0
		expect(counterDelta(5, 9)).toBe(4);
		expect(counterDelta(9, 2)).toBe(0);      // counter reset / ssrc reuse
		expect(counterDelta(5, 5)).toBe(0);
		expect(counterDelta(undefined, 5)).toBe(0);
		expect(counterDelta(5, undefined)).toBe(0);
	});

	it('SlidingWindow evicts by time and caps entries', () => {
		const w = new SlidingWindow<string>(1000);

		w.add('a', 1000);
		w.add('b', 1500);
		w.add('c', 1900);

		expect(w.values(1900)).toEqual([ 'a', 'b', 'c' ]);
		// at t=2200 the cutoff is 1200, so 'a' (t=1000) has aged out
		expect(w.values(2200)).toEqual([ 'b', 'c' ]);
		// at t=2600 the cutoff is 1600, so 'b' (t=1500) is gone too
		expect(w.values(2600)).toEqual([ 'c' ]);
		expect(w.values(3000)).toEqual([]);

		const capped = new SlidingWindow<number>(60_000, 3);

		for (let i = 0; i < 10; i++) capped.add(i, 1000 + i);
		expect(capped.size).toBe(3);
	});
});

describe('pageHinkley', () => {

	// A hand-worked example first, small enough to check with a calculator, to see exactly what
	// the two parameters do before trusting them on realistic data below.
	//
	// Series: three observations at 10, then one jump to 20.
	// At i=3 the running mean of [10, 10, 10, 20] is 12.5, so the jump's "surprise" relative to
	// everything seen so far is 20 - 12.5 = 7.5. delta is subtracted from that surprise before
	// it's allowed to accumulate - it's the band of step-to-step increase that's written off as
	// noise rather than a real shift.
	it('with delta=0, any surprise above the running mean accumulates - the jump shows up as 7.5', () => {
		const result = pageHinkley([ 10, 10, 10, 20 ], 0, 5);

		// nothing happens while every value equals the running mean...
		expect(result.statistic.slice(0, 3)).toEqual([ 0, 0, 0 ]);
		// ...until the jump: (20 - mean(10,10,10,20)=12.5 - delta=0) = 7.5, and there's no earlier
		// dip to net it against, so the Page-Hinkley statistic is that surprise.
		expect(result.statistic[3]).toBe(7.5);
		// 7.5 clears lambda=5, so this reads as a detected (sustained-looking) increase.
		expect(result.changePointIndex).toBe(3);
		expect(result.changeDetected).toBe(true);
	});

	it('raising delta absorbs the very same jump - it no longer clears the noise band', () => {
		// Same series, but now anything under 10ms of surprise is tolerated: (20 - 12.5 - 10) = -2.5,
		// i.e. even after the "jump" the running sum is still going down, not up. runningMinimum
		// simply follows it there, so the gap (the statistic) stays 0 - nothing looks unusual.
		const result = pageHinkley([ 10, 10, 10, 20 ], 10, 5);

		expect(result.statistic).toEqual([ 0, 0, 0, 0 ]);
		expect(result.changeDetected).toBe(false);
	});

	// A more realistic case: RTT (ms) samples from a WebRTC session, first 10 seconds healthy
	// (~40ms, +/-2-3ms of ordinary jitter), then a shift to sustained congestion (~90ms) - the
	// pattern a real bufferbloat/route change produces, as opposed to one slow ping.
	const healthyRttsMs = [ 40, 41, 39, 40, 42, 38, 40, 41, 39, 40 ];
	const congestedRttsMs = [ 88, 90, 93, 89, 91, 94, 90, 92, 89, 91 ];

	it('stays quiet through ordinary jitter - delta absorbs +/-2-3ms of noise around 40ms', () => {
		// Called on the healthy segment alone: every sample is within a couple of ms of the running
		// mean, comfortably inside delta=5, so the statistic never leaves 0.
		const result = pageHinkley(healthyRttsMs, 5, 40);

		expect(result.statistic.every((s) => s === 0)).toBe(true);
		expect(result.changeDetected).toBe(false);
	});

	it('detects the congestion shift a couple of samples after it starts, not before', () => {
		const rttsMs = [ ...healthyRttsMs, ...congestedRttsMs ];
		const result = pageHinkley(rttsMs, 5, 40);

		// The healthy prefix (indices 0-9) still contributes nothing...
		expect(result.statistic.slice(0, 10)).toEqual(new Array(10).fill(0));

		// ...but as soon as RTT jumps to ~90ms, each sample is far outside the tolerance band around
		// the still-~40ms running mean, so the statistic climbs fast: index 10 (the first 88ms
		// sample) alone is already close to lambda, and index 11 (90ms) pushes it over.
		expect(result.statistic[10]).toBeCloseTo(38.64, 1);
		expect(result.statistic[11]).toBeCloseTo(75.47, 1);

		expect(result.changeDetected).toBe(true);
		expect(result.changePointIndex).toBe(11); // one sample into the congested phase, not ten
	});

	it('a stricter lambda asks for more evidence before calling it - detection lands later, not never', () => {
		const rttsMs = [ ...healthyRttsMs, ...congestedRttsMs ];

		const lenient = pageHinkley(rttsMs, 5, 40);
		const strict = pageHinkley(rttsMs, 5, 150);

		// Same underlying statistic (lambda doesn't change the math, only where the line is drawn)...
		expect(strict.statistic).toEqual(lenient.statistic);
		// ...but the stricter threshold needs a few more congested samples to accumulate past it.
		expect(lenient.changePointIndex).toBe(11);
		expect(strict.changePointIndex).toBe(14);
	});

	it('a single huge transient spike can trigger detection on its own, then the statistic fades back out', () => {
		// One outlier sample (200ms - e.g. a single delayed STUN response) amid otherwise-healthy
		// RTTs, not a sustained shift.
		const rttsMs = [ 40, 41, 39, 40, 42, 200, 41, 39, 40, 42, 38, 40, 41, 39, 40 ];
		const result = pageHinkley(rttsMs, 5, 40);

		// The spike alone is large enough to cross lambda in one step - Page-Hinkley doesn't require
		// several samples if a single one is surprising enough.
		expect(result.changePointIndex).toBe(5);
		expect(result.changeDetected).toBe(true);

		// But unlike the sustained-congestion case above, the following samples return to the old
		// level, so the running mean catches back up and the statistic decays towards 0 again...
		expect(result.statistic[6]).toBeLessThan(result.statistic[5]);
		expect(result.statistic[result.statistic.length - 1]).toBe(0);
		// ...even though changeDetected/changePointIndex stay latched to that first crossing - this
		// call only ever reports the first time the threshold was crossed (see the
		// PageHinkleyResult.changePointIndex doc). A live caller re-running this over just the
		// current window (as TrendTester does) is what makes the flag drop again once the spike
		// ages out.
	});
});

describe('mannKendall', () => {

	// A hand-worked example first, small enough to check every pairwise vote by hand, to see
	// exactly what `s` counts before trusting it on realistic data below.
	//
	// Series: [1, 2, 3] - strictly increasing, so all 3 pairs ((0,1), (0,2), (1,2)) vote +1 and
	// s = 3. But with only 3 points, even a perfect run of +1s isn't enough evidence to rule out
	// chance: with n this small, s = 3 (every possible pair agreeing) is the *most* extreme outcome
	// there is, yet the two-tailed p-value it produces is still nowhere near 0.05.
	it('a perfectly increasing series is not "significant" when there are only 3 points', () => {
		const result = mannKendall([ 1, 2, 3 ]);

		expect(result.s).toBe(3);
		// tie-free variance formula: n(n-1)(2n+5)/18 = 3*2*11/18
		expect(result.variance).toBeCloseTo((3 * 2 * 11) / 18);
		expect(result.pValue).toBeGreaterThan(0.05);
		expect(result.trend).toBe('no-trend');
	});

	it('the same monotonic shape over more points clears the significance bar', () => {
		// Same idea as above - every later value is larger than every earlier one - but now with
		// enough pairs (45 of them) for the normal approximation to rule out chance.
		const result = mannKendall([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ]);

		expect(result.s).toBe(45); // every one of C(10,2) = 45 pairs votes +1
		expect(result.z).toBeGreaterThan(3);
		expect(result.pValue).toBeLessThan(0.001);
		expect(result.trend).toBe('increasing');
	});

	it('a decreasing series is the mirror image - negative s, negative z, "decreasing"', () => {
		const result = mannKendall([ 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 ]);

		expect(result.s).toBe(-45);
		expect(result.z).toBeLessThan(-3);
		expect(result.pValue).toBeLessThan(0.001);
		expect(result.trend).toBe('decreasing');
	});

	it('an up-and-down series nets out near s=0 - the noise trend votes cancel out', () => {
		const result = mannKendall([ 10, 12, 9, 13, 8, 14, 7, 15, 6, 16 ]);

		expect(Math.abs(result.s)).toBeLessThan(10);
		expect(result.trend).toBe('no-trend');
	});

	// Ties (equal values) vote 0 rather than +-1, so they carry no directional information - but
	// they also make the remaining votes *less* dispersed than the tie-free formula assumes, which
	// is what the tie correction subtracts back out of the variance.
	it('ties vote 0 and shrink the variance via the tie correction', () => {
		const noTies = mannKendall([ 1, 2, 3, 4, 5, 6 ]);
		const withTies = mannKendall([ 1, 1, 2, 2, 3, 3 ]);

		// Tie-free variance: n(n-1)(2n+5)/18 = 6*5*17/18.
		expect(noTies.variance).toBeCloseTo((6 * 5 * 17) / 18);
		// 3 tied pairs ((0,1), (2,3), (4,5)) vote 0 instead of +1, so s drops from 15 to 12...
		expect(noTies.s).toBe(15);
		expect(withTies.s).toBe(12);
		// ...and each of the 3 tied groups (size 2) subtracts g(g-1)(2g+5) = 2*1*9 = 18 from the
		// n(n-1)(2n+5) numerator before dividing by 18, i.e. 1 full point of variance per group.
		expect(withTies.variance).toBeCloseTo(noTies.variance - 3);
		// Still a real (if noisier) increasing pattern.
		expect(withTies.trend).toBe('increasing');
	});

	// Realistic case: RTT (ms) samples across a call. A flat, jittery session should not read as a
	// trend; a session that keeps climbing sample after sample should, clearly, in either direction.
	it('stays "no-trend" for ordinary jitter around a flat RTT', () => {
		const jitteryRttsMs = [ 40, 42, 39, 41, 38, 43, 40, 39, 41, 40, 42, 38 ];
		const result = mannKendall(jitteryRttsMs);

		expect(result.trend).toBe('no-trend');
	});

	it('detects a gradually degrading RTT (bufferbloat building up) as "increasing"', () => {
		// Not a clean jump like the pageHinkley RTT example - a slow, monotonic-ish climb, exactly
		// the shape Mann-Kendall is suited for and a single before/after mean comparison is not.
		const climbingRttsMs = [ 40, 42, 41, 45, 47, 46, 52, 55, 58, 60, 65, 70 ];
		const result = mannKendall(climbingRttsMs);

		expect(result.s).toBeGreaterThan(0);
		expect(result.trend).toBe('increasing');
	});

	it('detects a recovering RTT (congestion clearing) as "decreasing"', () => {
		const recoveringRttsMs = [ 95, 90, 92, 85, 80, 78, 70, 65, 60, 55, 50, 45 ];
		const result = mannKendall(recoveringRttsMs);

		expect(result.s).toBeLessThan(0);
		expect(result.trend).toBe('decreasing');
	});

	it('fewer than 2 points is defined as "no-trend" rather than throwing', () => {
		expect(mannKendall([]).trend).toBe('no-trend');
		expect(mannKendall([ 42 ]).trend).toBe('no-trend');
	});

	// mannKendallVerdict is the back half of mannKendall, split out for a caller that maintains its
	// own running `s` / `variance` (e.g. over a sliding window). Feeding it the s/variance
	// mannKendall computed for the same series must agree exactly with mannKendall's own verdict.
	it('mannKendallVerdict reproduces the verdict half of mannKendall from s and variance alone', () => {
		const climbingRttsMs = [ 40, 42, 41, 45, 47, 46, 52, 55, 58, 60, 65, 70 ];
		const full = mannKendall(climbingRttsMs);
		const verdict = mannKendallVerdict(full.s, full.variance);

		expect(verdict).toEqual({ z: full.z, pValue: full.pValue, trend: full.trend });
	});
});
