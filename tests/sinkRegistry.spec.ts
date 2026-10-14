import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Observer } from '../src/Observer';
import type { Sink, SinkSettings } from '../src/sinks/Sink';
import { SinkRegistry } from '../src/sinks/SinkRegistry';
import type { ClientSampleSink } from '../src/sinks/ClientSampleSink';
import { JsonlFileSink } from '../src/sinks/JsonlFileSink';
import { InMemorySink } from '../src/sinks/InMemorySink';
import type { ClientSample } from '../src/schema/ClientSample';

/** Records what happened to it. Counts constructions so a refused `create` can be checked. */
class RecordingSink extends EventEmitter implements Sink<unknown> {
	public static constructed = 0;
	public readonly id: string;
	public readonly records: unknown[] = [];
	public readonly label?: string;
	public endCalls = 0;
	public ended = false;

	public constructor(settings: SinkSettings & { label?: string }) {
		super();
		this.id = settings.id;
		this.label = settings.label;
		++RecordingSink.constructed;
	}

	public write(record: unknown): boolean {
		if (this.ended) return false;
		this.records.push(record);

		return true;
	}

	public end(): void {
		if (this.ended) return;
		this.ended = true;
		++this.endCalls;
		this.emit('ended');
		this.emit('close');
	}
}

/* Fakes for the mediasoup `types.*` objects, as in mediasoupRouter.spec.ts. */
const fakeRouter = (id = 'router-1') => ({ id, observer: new EventEmitter() }) as any;
const fakePipeTransport = (id: string) => ({
	id,
	type: 'pipe',
	tuple: { localAddress: '10.0.0.1', localPort: 4000, protocol: 'udp' },
	observer: new EventEmitter(),
}) as any;

const sample = (clientId: string): ClientSample => ({ callId: 'call-1', clientId, timestamp: Date.now() } as ClientSample);

describe('SinkRegistry', () => {
	it('creates and registers a sink, writes to it by id, and drops it once the sink is ended', () => {
		const registry = new SinkRegistry();
		const sink = registry.create(RecordingSink, { id: 'a', label: 'x' })!;

		expect(sink).toBeInstanceOf(RecordingSink);
		expect(sink.id).toBe('a');
		expect(sink.label).toBe('x');
		expect(registry.get('a')).toBe(sink);
		expect(registry.write('a', { n: 1 })).toBe(true);
		expect(registry.write('missing', { n: 2 })).toBe(false);

		sink.end();
		sink.end();

		expect(sink.ended).toBe(true);
		expect(sink.endCalls).toBe(1);
		expect(registry.get('a')).toBeUndefined();
		expect(registry.write('a', { n: 3 })).toBe(false);
		expect(sink.write({ n: 4 })).toBe(false);
		expect(sink.records).toEqual([ { n: 1 } ]);
	});

	it('generates an id when none is given', () => {
		const registry = new SinkRegistry();
		const sink = registry.create(RecordingSink, {})!;

		expect(sink.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(registry.get(sink.id)).toBe(sink);
	});

	it('keeps ids unique across the tree without constructing the refused sink, and lets a parent reach its descendants\' sinks', () => {
		const root = new SinkRegistry();
		const callA = new SinkRegistry(root);
		const callB = new SinkRegistry(root);
		const aliceA = callA.create(RecordingSink, { id: 'alice' })!;
		const before = RecordingSink.constructed;

		// Taken in callA: refused in the same registry, a sibling and the parent — nothing constructed.
		expect(callA.create(RecordingSink, { id: 'alice' })).toBeUndefined();
		expect(callB.create(RecordingSink, { id: 'alice' })).toBeUndefined();
		expect(root.create(RecordingSink, { id: 'alice' })).toBeUndefined();
		expect(RecordingSink.constructed).toBe(before);

		const own = root.create(RecordingSink, { id: 'own' })!;

		expect(callA.create(RecordingSink, { id: 'own' })).toBeUndefined();

		// A parent addresses its descendants' sinks; a child does not see its siblings' or its parent's.
		expect(root.get('alice')).toBe(aliceA);
		expect(root.write('alice', { n: 1 })).toBe(true);
		expect(aliceA.records).toEqual([ { n: 1 } ]);
		expect(callB.get('alice')).toBeUndefined();
		expect(callB.get('own')).toBeUndefined();
		expect([ root.size, callA.size, callB.size ]).toEqual([ 2, 1, 0 ]);

		// Ending a sink frees its id everywhere.
		aliceA.end();
		expect(root.get('alice')).toBeUndefined();

		const aliceB = callB.create(RecordingSink, { id: 'alice' })!;

		root.clear();
		expect([ aliceB.endCalls, own.endCalls ]).toEqual([ 1, 1 ]);
		expect([ root.size, callA.size, callB.size ]).toEqual([ 0, 0, 0 ]);
	});

	it('keeps a failing sink from crashing the process', () => {
		const sink = new SinkRegistry().create(RecordingSink, { id: 'a' })!;

		expect(() => sink.emit('error', new Error('disk full'))).not.toThrow();
	});
});

describe('sinks on the observed objects', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sinks-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('writes a client\'s samples to the sink under its id in the call, and ends it when the client closes', () => {
		const sinks: InMemorySink[] = [];
		const observer = new Observer({ closeCallIfEmptyForMs: undefined });

		observer.on('client-added', ({ observedCall, observedClient }) => {
			sinks.push(observedCall.sinks.create(InMemorySink, { id: observedClient.clientId })!);
		});
		observer.accept(sample('alice'));

		const call = observer.getObservedCall('call-1')!;
		const client = call.getObservedClient('alice')!;

		expect(client.sink).toBe(sinks[0]);
		expect(sinks[0].samples).toHaveLength(1);

		let closed = 0;

		sinks[0].on('close', () => ++closed);
		client.close();

		expect(sinks[0].ended).toBe(true);
		expect(call.sinks.get('alice')).toBeUndefined();
		expect(closed).toBe(1);

		observer.close();
		expect(closed).toBe(1);
	});

	it('ends a router\'s sinks when the router closes, and lets the app end one when its transport closes', async () => {
		const observer = new Observer();
		const router = fakeRouter();
		const observedRouter = observer.createObservedMediasoupRouter({ router })!;
		const pipe1 = fakePipeTransport('pipe-1');
		const pipe2 = fakePipeTransport('pipe-2');

		observedRouter.on('transport-sample-closed', ({ transport }) => observedRouter.sinks.get(transport.id)?.end());
		router.observer.emit('newtransport', pipe1);
		router.observer.emit('newtransport', pipe2);

		const file1 = path.join(dir, 'pipe-1.jsonl');
		const sink1 = observedRouter.sinks.create(JsonlFileSink<{ bytesSent: number }[]>, { id: 'pipe-1', path: file1 })!;
		const sink2 = observedRouter.sinks.create(RecordingSink, { id: 'pipe-2' })!;

		observedRouter.sinks.write('pipe-1', [ { bytesSent: 1 } ]);
		sink1.write([ { bytesSent: 2 } ]);

		const flushed = new Promise<void>((resolve) => sink1.once('close', () => resolve()));

		pipe1.observer.emit('close');
		await flushed;

		expect(observedRouter.sinks.get('pipe-1')).toBeUndefined();
		expect(fs.readFileSync(file1, 'utf8').trim().split('\n').map((line) => JSON.parse(line))).toEqual([ [ { bytesSent: 1 } ], [ { bytesSent: 2 } ] ]);
		expect(sink2.ended).toBe(false);

		// mediasoup closes the router's transports first, then the router.
		router.observer.emit('close');
		expect(sink2.endCalls).toBe(1);
		observer.close();
	});

	it('ends the call\'s own sinks when the call closes, and every remaining sink when the observer closes', () => {
		const observer = new Observer({ closeCallIfEmptyForMs: undefined });
		const call = observer.createObservedCall({ callId: 'call-1' })!;
		const observedRouter = observer.createObservedMediasoupRouter({ router: fakeRouter() })!;
		const callSink = call.sinks.create(RecordingSink, { id: 'sfu' })!;
		const routerSink = observedRouter.sinks.create(RecordingSink, { id: 'router-stats' })!;
		const observerSink = observer.sinks.create(RecordingSink, { id: 'worker' })!;

		call.close();
		expect([ callSink.ended, routerSink.ended, observerSink.ended ]).toEqual([ true, false, false ]);

		// observer.close() does not close mediasoup routers, but it does end their sinks.
		observer.close();
		expect([ callSink.endCalls, routerSink.endCalls, observerSink.endCalls ]).toEqual([ 1, 1, 1 ]);
		expect(observedRouter.closed).toBe(false);
	});

	it('takes custom ClientSampleSink implementations', () => {
		class HttpLikeSink extends EventEmitter implements ClientSampleSink {
			public readonly id: string;
			public readonly received: ClientSample[] = [];
			public readonly url: string;
			public ended = false;

			public constructor(settings: SinkSettings & { url: string }) {
				super();
				this.id = settings.id;
				this.url = settings.url;
			}

			public write(s: ClientSample): boolean {
				this.received.push(s);

				return true;
			}

			public end(): void {
				if (this.ended) return;
				this.ended = true;
				this.emit('ended');
				this.emit('close');
			}
		}
		let custom: HttpLikeSink | undefined;
		const observer = new Observer();

		observer.on('client-added', ({ observedCall, observedClient }) => {
			custom = observedCall.sinks.create(HttpLikeSink, { id: observedClient.clientId, url: `https://x/${observedClient.clientId}` });
		});
		observer.accept(sample('bob'));
		observer.close();

		expect(custom?.url).toBe('https://x/bob');
		expect(custom?.received).toHaveLength(1);
		expect(custom?.ended).toBe(true);
	});
});
