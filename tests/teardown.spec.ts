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

/**
 * Timers must not outlive the thing that armed them.
 *
 * Both `ObservedClient` (idle timer, armed on every accepted sample) and `ObservedCall` (empty-call
 * timer, armed when the last client leaves) used to leave their handle live after `close()`. The
 * effect was invisible — the callback checks `closed` and returns — but the handle pinned the event
 * loop, so a process that had finished its work would sit there for up to a minute. Jest reported it
 * as 231 open handles and a worker that had to be force-exited.
 */
describe('timers do not outlive close()', () => {
	const sample = (clientId: string, callId = 'call-1') => ({
		callId,
		clientId,
		timestamp: Date.now(),
		peerConnections: [ { peerConnectionId: `pc-${clientId}` } ],
	} as never);

	it('clears the client idle timer on close', () => {
		jest.useRealTimers();

		const observer = new Observer({ autoUpdateOnCallUpdate: false, closeClientIfIdleForMs: 60_000 });

		observer.accept(sample('alice'));

		const client = observer.getObservedCall('call-1')!.getObservedClient('alice')!;

		expect((client as unknown as { closeTimer?: unknown }).closeTimer).toBeDefined();

		client.close();

		expect((client as unknown as { closeTimer?: unknown }).closeTimer).toBeUndefined();

		observer.close();
	});

	it('clears the empty-call timer on close', () => {
		jest.useRealTimers();

		const observer = new Observer({ autoUpdateOnCallUpdate: false, closeCallIfEmptyForMs: 60_000 });

		observer.accept(sample('alice'));

		const call = observer.getObservedCall('call-1')!;

		// The empty-call timer is armed when the last client leaves.
		call.getObservedClient('alice')!.close();
		expect((call as unknown as { closeTimer?: unknown }).closeTimer).toBeDefined();

		call.close();
		expect((call as unknown as { closeTimer?: unknown }).closeTimer).toBeUndefined();

		observer.close();
	});
});
