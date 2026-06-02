import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe('client lifecycle events', () => {
	it('emits client-joined and sets joinedAt on CLIENT_JOINED', () => {
		const observer = new Observer();
		const joined: string[] = [];

		observer.on('client-joined', ({ observedClient }) => joined.push(observedClient.clientId));
		observer.accept(makeSample({ timestamp: 1000, clientEvents: [ { type: 'CLIENT_JOINED', timestamp: 1000 } ] }));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

		expect(joined).toEqual([ 'client-1' ]);
		expect(client?.joinedAt).toBe(1000);

		observer.close();
	});

	it('emits client-left and sets leftAt on CLIENT_LEFT', () => {
		const observer = new Observer();
		const left: string[] = [];

		observer.on('client-left', ({ observedClient }) => left.push(observedClient.clientId));
		observer.accept(makeSample({ timestamp: 2000, clientEvents: [ { type: 'CLIENT_LEFT', timestamp: 2000 } ] }));

		const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

		expect(left).toEqual([ 'client-1' ]);
		expect(client?.leftAt).toBe(2000);

		observer.close();
	});

	it('emits a generic client-event for processed client events', () => {
		const observer = new Observer();
		const types: string[] = [];

		observer.on('client-event', ({ event }) => types.push(event.type));
		observer.accept(makeSample({ timestamp: 3000, clientEvents: [ { type: 'CLIENT_JOINED', timestamp: 3000 } ] }));

		expect(types).toContain('CLIENT_JOINED');

		observer.close();
	});
});

describe('accept context threading', () => {
	it('carries the accept context through to client-updated', () => {
		const observer = new Observer();
		let context: unknown;

		observer.on('client-updated', (payload) => { context = payload.context; });
		observer.accept(makeSample({}), { sessionId: 'sess-1' });

		expect(context).toEqual({ sessionId: 'sess-1' });

		observer.close();
	});

	it('omits context when none is passed', () => {
		const observer = new Observer();
		let seen = false;
		let context: unknown = 'unset';

		observer.on('client-updated', (payload) => { seen = true; context = payload.context; });
		observer.accept(makeSample({}));

		expect(seen).toBe(true);
		expect(context).toBeUndefined();

		observer.close();
	});
});
