import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe("update policy 'none'", () => {
	it('does not auto-emit observer-updated / call-updated; only explicit update() does', () => {
		const observer = new Observer({ updatePolicy: 'none', defaultCallUpdatePolicy: 'none' });
		let observerUpdated = 0;
		let callUpdated = 0;

		observer.on('observer-updated', () => { observerUpdated += 1; });
		observer.on('call-updated', () => { callUpdated += 1; });

		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));

		// no automatic updates happened
		expect(callUpdated).toBe(0);
		expect(observerUpdated).toBe(0);

		// explicit update() works and is public on both
		observer.getObservedCall('call-1')?.update();
		expect(callUpdated).toBe(1);

		observer.update();
		expect(observerUpdated).toBe(1);

		observer.close();
	});

	it('the default (event-driven) policy still auto-updates on accept', () => {
		const observer = new Observer({ defaultCallUpdatePolicy: 'update-on-any-client-updated' });
		let callUpdated = 0;

		observer.on('call-updated', () => { callUpdated += 1; });
		observer.accept(makeSample({}));

		expect(callUpdated).toBeGreaterThan(0);

		observer.close();
	});
});
