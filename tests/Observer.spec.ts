import { Observer } from '../src/Observer';
import { InMemorySink, createInMemorySink } from '../src/sinks/InMemorySink';
import { makeSample, nextTimestamp } from './helpers/samples';

describe('Observer', () => {
	describe('accept() entity creation', () => {
		it('lazily creates the call, client and peer connection from a sample', () => {
			const observer = new Observer();

			observer.accept(makeSample({ peerConnections: [ { peerConnectionId: 'pc-1' } ] }));

			expect(observer.numberOfCalls).toBe(1);

			const call = observer.getObservedCall('call-1');

			expect(call).toBeDefined();

			const client = call?.getObservedClient('client-1');

			expect(client).toBeDefined();
			expect(client?.observedPeerConnections.has('pc-1')).toBe(true);

			observer.close();
		});

		it('reuses the same call/client across samples', () => {
			const observer = new Observer();

			observer.accept(makeSample({}));
			observer.accept(makeSample({}));

			expect(observer.numberOfCalls).toBe(1);
			expect(observer.getObservedCall('call-1')?.observedClients.size).toBe(1);

			observer.close();
		});
	});

	describe('sample-rejected', () => {
		it('rejects a sample with no callId', () => {
			const observer = new Observer();
			const reasons: string[] = [];

			observer.on('sample-rejected', ({ reason }) => reasons.push(reason));
			observer.accept({ timestamp: nextTimestamp(), clientId: 'client-1' });

			expect(reasons).toEqual([ 'missing-callId' ]);
			expect(observer.numberOfCalls).toBe(0);

			observer.close();
		});

		it('rejects a sample with no clientId', () => {
			const observer = new Observer();
			const reasons: string[] = [];

			observer.on('sample-rejected', ({ reason }) => reasons.push(reason));
			observer.accept({ timestamp: nextTimestamp(), callId: 'call-1' });

			expect(reasons).toEqual([ 'missing-clientId' ]);

			observer.close();
		});

		it('rejects samples after the observer is closed', () => {
			const observer = new Observer();

			observer.close();

			const reasons: string[] = [];

			observer.on('sample-rejected', ({ reason }) => reasons.push(reason));
			observer.accept(makeSample({}));

			expect(reasons).toEqual([ 'observer-closed' ]);
		});
	});

	describe('create / getOrCreate (warn, do not throw)', () => {
		it('returns undefined when creating on a closed observer', () => {
			const observer = new Observer();

			observer.close();

			expect(observer.createObservedCall({ callId: 'c' })).toBeUndefined();
		});

		it('returns the existing instance on duplicate id', () => {
			const observer = new Observer();
			const a = observer.createObservedCall({ callId: 'c' });
			const b = observer.createObservedCall({ callId: 'c' });

			expect(a).toBeDefined();
			expect(b).toBe(a);

			observer.close();
		});

		it('getOrCreateObservedCall returns the same instance', () => {
			const observer = new Observer();
			const a = observer.getOrCreateObservedCall({ callId: 'c' });
			const b = observer.getOrCreateObservedCall({ callId: 'c' });

			expect(a).toBe(b);

			observer.close();
		});
	});

	describe('events', () => {
		it('emits call-added and client-added with full ancestry', () => {
			const observer = new Observer();
			const calls: string[] = [];
			const clients: string[] = [];

			observer.on('call-added', ({ observer: o, observedCall }) => {
				expect(o).toBe(observer);
				calls.push(observedCall.callId);
			});
			observer.on('client-added', ({ observedCall, observedClient }) => {
				expect(observedCall.callId).toBe('call-1');
				clients.push(observedClient.clientId);
			});

			observer.accept(makeSample({}));

			expect(calls).toEqual([ 'call-1' ]);
			expect(clients).toEqual([ 'client-1' ]);

			observer.close();
		});

		it('emits observer-closed once on close', () => {
			const observer = new Observer();
			let closed = 0;

			observer.on('observer-closed', () => { closed += 1; });
			observer.close();
			observer.close();

			expect(closed).toBe(1);
			expect(observer.closed).toBe(true);
		});
	});

	describe('appData factories', () => {
		it('applies createCallAppData / createClientAppData to lazily-created entities', () => {
			const observer = new Observer({
				createCallAppData: ({ callId }) => ({ callId, region: 'eu' }),
				createClientAppData: ({ clientId, observedCall }) => ({ clientId, region: observedCall.appData.region }),
			});

			observer.accept(makeSample({}));

			const call = observer.getObservedCall('call-1');
			const client = call?.getObservedClient('client-1');

			expect(call?.appData.region).toBe('eu');
			expect(client?.appData.region).toBe('eu');

			observer.close();
		});

		// The context is what an accept middleware writes into, so a factory that cannot see it has to
		// re-derive from the sample what the middleware already worked out.
		it('hands the accept() context to both factories', () => {
			const seen: Record<string, unknown>[] = [];
			const observer = new Observer({
				createCallAppData: ({ acceptCtx }) => (seen.push({ level: 'call', ...acceptCtx }), { ...acceptCtx }),
				createClientAppData: ({ acceptCtx }) => (seen.push({ level: 'client', ...acceptCtx }), { ...acceptCtx }),
			});

			observer.accept(makeSample({}), { tenant: 'acme' });

			expect(seen).toEqual([
				{ level: 'call', tenant: 'acme' },
				{ level: 'client', tenant: 'acme' },
			]);
			expect(observer.getObservedCall('call-1')?.appData.tenant).toBe('acme');

			observer.close();
		});

		// `createObservedClient` used to write the resolved defaults back onto the caller's object, so a
		// settings object reused as a template came back carrying the first client's appData — and
		// every later client silently inherited it, factory or not.
		it('does not mutate the settings object it was given', () => {
			const observer = new Observer({
				createClientAppData: ({ clientId }) => ({ clientId }),
			});
			const call = observer.createObservedCall({ callId: 'call-1' })!;
			const settings: { clientId: string, appData?: Record<string, unknown> } = { clientId: 'alice' };

			call.createObservedClient(settings);

			expect(settings.appData).toBeUndefined();
			expect(settings).toEqual({ clientId: 'alice' });

			settings.clientId = 'bob';
			const bob = call.createObservedClient(settings);

			expect(bob?.appData.clientId).toBe('bob');

			observer.close();
		});
	});

	describe('per-client sinks', () => {
		it('creates a sink via createClientSink and emits client-sink-created', () => {
			const observer = new Observer({
				createClientSink: () => createInMemorySink(),
			});
			let eventSink: unknown;

			observer.on('client-sink-created', ({ sink }) => { eventSink = sink; });

			observer.accept(makeSample({}));

			const client = observer.getObservedCall('call-1')?.getObservedClient('client-1');

			expect(client?.sink).toBeInstanceOf(InMemorySink);
			expect(eventSink).toBe(client?.sink);

			observer.close();
		});
	});
});
