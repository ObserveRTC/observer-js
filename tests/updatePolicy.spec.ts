import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe('autoUpdateOnCallUpdate / autoUpdateOnClientUpdate set to false', () => {
	it('does not auto-emit observer-updated / call-updated; only explicit update() does', () => {
		const observer = new Observer({ autoUpdateOnCallUpdate: false });
		let observerUpdated = 0;
		let callUpdated = 0;

		observer.on('observer-updated', () => { observerUpdated += 1; });
		observer.on('call-updated', () => { callUpdated += 1; });

		// Pre-create the call with client-driven auto-update disabled too, so `accept()` (which would
		// otherwise create it with the default `autoUpdateOnClientUpdate: true`) reuses this one.
		observer.createObservedCall({ callId: 'call-1', autoUpdateOnClientUpdate: false });
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

	it('the default (event-driven) behaviour still auto-updates on accept', () => {
		const observer = new Observer();
		let callUpdated = 0;

		observer.on('call-updated', () => { callUpdated += 1; });
		observer.accept(makeSample({}));

		expect(callUpdated).toBeGreaterThan(0);

		observer.close();
	});
});
