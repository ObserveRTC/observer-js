import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe('auto-teardown timers', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it('closes an idle client after closeClientIfIdleForMs', () => {
		const observer = new Observer({ closeClientIfIdleForMs: 5000 });

		observer.accept(makeSample({}));

		const call = observer.getObservedCall('call-1');

		expect(call?.getObservedClient('client-1')).toBeDefined();

		jest.advanceTimersByTime(5001);

		expect(call?.getObservedClient('client-1')).toBeUndefined();

		observer.close();
	});

	it('closes an empty call after closeCallIfEmptyForMs', () => {
		const observer = new Observer({ closeCallIfEmptyForMs: 10_000 });

		observer.accept(makeSample({}));
		observer.getObservedCall('call-1')?.getObservedClient('client-1')?.close();

		// the call is empty but not yet closed
		expect(observer.getObservedCall('call-1')).toBeDefined();

		jest.advanceTimersByTime(10_001);

		expect(observer.getObservedCall('call-1')).toBeUndefined();

		observer.close();
	});

	it('does not close a client that keeps sending samples', () => {
		const observer = new Observer({ closeClientIfIdleForMs: 5000 });

		observer.accept(makeSample({ timestamp: 1000 }));
		jest.advanceTimersByTime(3000);
		observer.accept(makeSample({ timestamp: 4000 })); // re-arms the idle timer
		jest.advanceTimersByTime(3000); // 6s since first sample, but only 3s since the last

		expect(observer.getObservedCall('call-1')?.getObservedClient('client-1')).toBeDefined();

		observer.close();
	});
});
