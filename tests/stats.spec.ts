import { percentile, median, summarize, counterDelta, SlidingWindow } from '../src/utils/stats';

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
