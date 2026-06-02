import { Observer } from '../src/Observer';
import type { AcceptMiddleware } from '../src/Observer';
import { makeSample, nextTimestamp } from './helpers/samples';

describe('Observer accept middlewares', () => {
	it('runs registered middlewares on every accepted sample, in order', () => {
		const observer = new Observer();
		const seen: string[] = [];

		const a: AcceptMiddleware = (payload, next) => { seen.push(`a:${payload.sample.clientId}`); next(payload); };
		const b: AcceptMiddleware = (payload, next) => { seen.push(`b:${payload.sample.clientId}`); next(payload); };

		observer.acceptMiddlewares.addMiddleware(a, b);
		observer.accept(makeSample({ clientId: 'x' }));

		expect(seen).toEqual([ 'a:x', 'b:x' ]);

		observer.close();
	});

	it('lets a middleware mutate the sample before dispatch (rewrite clientId)', () => {
		const observer = new Observer();

		observer.acceptMiddlewares.addMiddleware((payload, next) => {
			payload.sample.clientId = 'rewritten';
			next(payload);
		});
		observer.accept(makeSample({ clientId: 'original' }));

		const call = observer.getObservedCall('call-1');

		expect(call?.getObservedClient('rewritten')).toBeDefined();
		expect(call?.getObservedClient('original')).toBeUndefined();

		observer.close();
	});

	it('lets a middleware fill in a missing callId so the sample is accepted', () => {
		const observer = new Observer();

		observer.acceptMiddlewares.addMiddleware((payload, next) => {
			if (!payload.sample.callId) payload.sample.callId = 'filled';
			next(payload);
		});
		observer.accept({ timestamp: nextTimestamp(), clientId: 'c' });

		expect(observer.getObservedCall('filled')).toBeDefined();

		observer.close();
	});

	it('can be removed', () => {
		const observer = new Observer();
		const seen: string[] = [];
		const mw: AcceptMiddleware = (payload, next) => { seen.push('hit'); next(payload); };

		observer.acceptMiddlewares.addMiddleware(mw);
		observer.acceptMiddlewares.removeMiddleware(mw);
		observer.accept(makeSample({}));

		expect(seen).toEqual([]);

		observer.close();
	});
});
