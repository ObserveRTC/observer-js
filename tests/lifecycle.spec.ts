import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe('call/client lifecycle', () => {
	it('emits call-not-empty when the first client joins a call', () => {
		const observer = new Observer();
		const events: string[] = [];

		observer.on('call-not-empty', () => events.push('not-empty'));
		observer.accept(makeSample({}));

		expect(events).toEqual([ 'not-empty' ]);

		observer.close();
	});

	it('cascades close: client.close() removes the client and emits pc/client/call events', () => {
		const observer = new Observer();
		const events: string[] = [];

		observer.on('peer-connection-added', () => events.push('pc-added'));
		observer.on('peer-connection-closed', () => events.push('pc-closed'));
		observer.on('client-closed', () => events.push('client-closed'));
		observer.on('call-empty', () => events.push('call-empty'));

		observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));

		const call = observer.getObservedCall('call-1');

		call?.getObservedClient('client-1')?.close();

		expect(events).toContain('pc-added');
		expect(events).toContain('pc-closed');
		expect(events).toContain('client-closed');
		expect(events).toContain('call-empty');
		expect(call?.getObservedClient('client-1')).toBeUndefined();
		expect(call?.observedClients.size).toBe(0);

		observer.close();
	});

	it('getOrCreateObservedClient returns the same instance', () => {
		const observer = new Observer();
		const call = observer.createObservedCall({ callId: 'call-1' });
		const a = call?.getOrCreateObservedClient({ clientId: 'x' });
		const b = call?.getOrCreateObservedClient({ clientId: 'x' });

		expect(a).toBeDefined();
		expect(a).toBe(b);

		observer.close();
	});
});

describe('issues', () => {
	it('call.addIssue emits call-issue with ancestry', () => {
		const observer = new Observer();

		observer.accept(makeSample({}));

		const call = observer.getObservedCall('call-1');
		let received: { observedCall?: unknown, issue?: { type: string } } = {};

		observer.on('call-issue', (p) => { received = p; });
		call?.addIssue({ type: 'srv:test', payload: {}, timestamp: 1 });

		expect(received.observedCall).toBe(call);
		expect(received.issue?.type).toBe('srv:test');

		observer.close();
	});

	it('client.addIssue emits client-issue', () => {
		const observer = new Observer();

		observer.accept(makeSample({}));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');
		const types: string[] = [];

		observer.on('client-issue', ({ issue }) => types.push(issue.type));
		client?.addIssue({ type: 'client:test' });

		expect(types).toEqual([ 'client:test' ]);

		observer.close();
	});
});

describe('detectors', () => {
	it('runs registered call detectors on call.update()', () => {
		const observer = new Observer();

		observer.accept(makeSample({}));

		const call = observer.getObservedCall('call-1');
		let runs = 0;

		call?.detectors.add({ name: 'counter', update: () => { runs += 1; } });
		call?.update();
		call?.update();

		expect(runs).toBe(2);

		observer.close();
	});

	it('a throwing detector does not break call.update()', () => {
		const observer = new Observer();

		observer.accept(makeSample({}));

		const call = observer.getObservedCall('call-1');

		call?.detectors.add({ name: 'boom', update: () => { throw new Error('boom'); } });

		expect(() => call?.update()).not.toThrow();

		observer.close();
	});
});
