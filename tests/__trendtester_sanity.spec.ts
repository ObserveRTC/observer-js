import { TrendTester } from '../src/utils/TrendTester';
import { mannKendall, pageHinkley } from '../src/utils/stats';

describe('TrendTester sanity', () => {
	it('matches batch mannKendall/pageHinkley over a growing window', () => {
		const values = [1, 2, 2, 3, 5, 4, 6, 7, 6, 8, 10, 9, 11, 12, 13];
		const tester = new TrendTester({ size: 100 });

		for (const v of values) tester.add(v);

		const batchMk = mannKendall(values);
		const incMk = tester.mannKendall();

		expect(incMk.s).toBe(batchMk.s);
		expect(incMk.variance).toBeCloseTo(batchMk.variance, 8);
		expect(incMk.z).toBeCloseTo(batchMk.z, 8);
		expect(incMk.trend).toBe(batchMk.trend);

		const batchPh = pageHinkley(values);
		const incPh = tester.pageHinkley();

		expect(incPh?.statistic).toEqual(batchPh.statistic);
		expect(incPh?.changeDetected).toBe(batchPh.changeDetected);
	});

	it('matches batch mannKendall over a bounded/evicting window', () => {
		const all = [5, 4, 3, 6, 7, 2, 9, 8, 10, 1, 12, 11, 13, 14, 3, 15];
		const size = 6;
		const tester = new TrendTester({ size });

		for (const v of all) tester.add(v);

		const windowed = all.slice(all.length - size);
		const batchMk = mannKendall(windowed);
		const incMk = tester.mannKendall();

		expect(incMk.s).toBe(batchMk.s);
		expect(incMk.variance).toBeCloseTo(batchMk.variance, 8);

		const batchPh = pageHinkley(windowed);
		const incPh = tester.pageHinkley();

		expect(incPh?.statistic).toEqual(batchPh.statistic);
	});
});
