import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Observer } from '../src/Observer';
import { JsonlFileSink } from '../src/sinks/JsonlFileSink';
import { InMemorySink } from '../src/sinks/InMemorySink';
import type { ClientSample } from '../src/schema/ClientSample';

type SfuStats = { bitrate: number };

function setup() {
	const observer = new Observer({ closeCallIfEmptyForMs: undefined });
	const call = observer.createObservedCall({ callId: 'call-1' })!;

	return { observer, call };
}

// InMemorySink is typed for client samples; the records here are arbitrary.
const records = (sink: InMemorySink) => sink.samples as unknown[];

describe('ObservedCall extension stats', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-stats-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('keeps the last data per id, with no sink required', () => {
		const { observer, call } = setup();

		expect(call.createExtensionStats({ id: 'sfu' })).toBeUndefined();
		expect(call.extensionStats.values.has('sfu')).toBe(true);
		expect(call.getExtensionStats<SfuStats>('sfu')).toBeUndefined();

		call.acceptExtensionStats('sfu', { bitrate: 1 });
		call.acceptExtensionStats('sfu', { bitrate: 2 });
		// Not created first: accepted all the same.
		call.acceptExtensionStats('other', { bitrate: 3 });

		expect(call.getExtensionStats<SfuStats>('sfu')).toEqual({ bitrate: 2 });
		expect(call.getExtensionStats<SfuStats>('other')).toEqual({ bitrate: 3 });
		observer.close();
	});

	it('writes every accepted data to the sink created with it, which ends with the call', async () => {
		const { observer, call } = setup();
		const file = path.join(dir, 'sfu.jsonl');
		const sink = call.createExtensionStats({ id: 'sfu', createSink: [ JsonlFileSink<SfuStats>, { path: file } ] })!;

		expect(sink).toBeInstanceOf(JsonlFileSink);
		expect(sink.id).toBe('sfu');
		expect(call.sinks.get('sfu')).toBe(sink);

		call.acceptExtensionStats('sfu', { bitrate: 1 });
		call.acceptExtensionStats('sfu', { bitrate: 2 });

		const flushed = new Promise<void>((resolve) => sink.once('close', () => resolve()));

		call.close();
		await flushed;

		expect(fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line))).toEqual([ { bitrate: 1 }, { bitrate: 2 } ]);
		expect(call.getExtensionStats<SfuStats>('sfu')).toEqual({ bitrate: 2 });
		observer.close();
	});

	it('replaces a sink the call already holds under the id when created with createSink', () => {
		const { observer, call } = setup();
		const existing = call.sinks.create(InMemorySink, { id: 'sfu' })!;
		const created = call.createExtensionStats({ id: 'sfu', createSink: [ InMemorySink, {} ] })!;

		expect(existing.ended).toBe(true);
		expect(call.sinks.get('sfu')).toBe(created);

		call.acceptExtensionStats('sfu', { bitrate: 1 });
		expect(records(created)).toEqual([ { bitrate: 1 } ]);
		expect(records(existing)).toEqual([]);
		observer.close();
	});

	it('writes to a sink created later under the same id, from then on', () => {
		const { observer, call } = setup();

		call.createExtensionStats({ id: 'sfu' });
		call.acceptExtensionStats('sfu', { bitrate: 1 });

		const later = call.sinks.create(InMemorySink, { id: 'sfu' })!;

		call.acceptExtensionStats('sfu', { bitrate: 2 });
		expect(records(later)).toEqual([ { bitrate: 2 } ]);
		observer.close();
	});

	it('creates no sink when another object of the observer holds the id, and nothing on a closed call', () => {
		const { observer, call } = setup();
		const other = observer.createObservedCall({ callId: 'call-2' })!;
		const held = other.sinks.create(InMemorySink, { id: 'sfu' })!;

		expect(call.createExtensionStats({ id: 'sfu', createSink: [ InMemorySink, {} ] })).toBeUndefined();
		expect(held.ended).toBe(false);

		// The data is still kept on the call; it just has no sink here.
		call.acceptExtensionStats('sfu', { bitrate: 1 });
		expect(call.getExtensionStats<SfuStats>('sfu')).toEqual({ bitrate: 1 });
		expect(records(held)).toEqual([]);

		call.close();
		expect(call.createExtensionStats({ id: 'late', createSink: [ InMemorySink, {} ] })).toBeUndefined();
		call.acceptExtensionStats('sfu', { bitrate: 2 });
		expect(call.getExtensionStats<SfuStats>('sfu')).toEqual({ bitrate: 1 });
		observer.close();
	});

	it('keeps a client sample sink apart from extension stats with a different id', () => {
		const { observer, call } = setup();

		call.createExtensionStats({ id: 'sfu', createSink: [ InMemorySink, {} ] });
		observer.on('client-added', ({ observedCall, observedClient }) => {
			observedCall.sinks.create(InMemorySink, { id: observedClient.clientId });
		});
		observer.accept({ callId: 'call-1', clientId: 'alice', timestamp: Date.now() } as ClientSample);
		call.acceptExtensionStats('sfu', { bitrate: 1 });

		expect(records(call.sinks.get<InMemorySink>('sfu')!)).toEqual([ { bitrate: 1 } ]);
		expect(call.sinks.get<InMemorySink>('alice')!.samples).toHaveLength(1);
		observer.close();
	});
});

describe('extension stats ids', () => {
	it('refuses to create an id twice, or one already accepted', () => {
		const { observer, call } = setup();

		call.createExtensionStats({ id: 'sfu' });
		expect(call.createExtensionStats({ id: 'sfu', createSink: [ InMemorySink, {} ] })).toBeUndefined();
		expect(call.sinks.get('sfu')).toBeUndefined();

		call.acceptExtensionStats('accepted-first', { bitrate: 1 });
		expect(call.createExtensionStats({ id: 'accepted-first', createSink: [ InMemorySink, {} ] })).toBeUndefined();

		// The way to give it a sink afterwards.
		const sink = call.sinks.create(InMemorySink, { id: 'accepted-first' })!;

		call.acceptExtensionStats('accepted-first', { bitrate: 2 });
		expect(records(sink)).toEqual([ { bitrate: 2 } ]);
		observer.close();
	});
});

describe('ObservedMediasoupRouter extension stats', () => {
	const fakeRouter = () => ({ id: 'router-1', observer: new EventEmitter() }) as any;

	it('keeps the last data, writes it to its sink, and ends the sink when the router closes', () => {
		const observer = new Observer();
		const router = fakeRouter();
		const observedRouter = observer.createObservedMediasoupRouter({ router })!;
		const sink = observedRouter.createExtensionStats({ id: 'pipe-1', createSink: [ InMemorySink, {} ] })!;

		observedRouter.acceptExtensionStats('pipe-1', [ { bytesSent: 1 } ]);
		observedRouter.acceptExtensionStats('pipe-1', [ { bytesSent: 2 } ]);

		expect(observedRouter.getExtensionStats('pipe-1')).toEqual([ { bytesSent: 2 } ]);
		expect(observedRouter.extensionStats.values.size).toBe(1);
		expect(records(sink)).toEqual([ [ { bytesSent: 1 } ], [ { bytesSent: 2 } ] ]);

		// Unique per observer: the call cannot take the router's id.
		const call = observer.createObservedCall({ callId: 'call-1' })!;

		expect(call.createExtensionStats({ id: 'pipe-1', createSink: [ InMemorySink, {} ] })).toBeUndefined();
		expect(sink.ended).toBe(false);

		router.observer.emit('close');
		expect(sink.ended).toBe(true);
		observedRouter.acceptExtensionStats('pipe-1', [ { bytesSent: 3 } ]);
		expect(observedRouter.getExtensionStats('pipe-1')).toEqual([ { bytesSent: 2 } ]);
		expect(observedRouter.createExtensionStats({ id: 'late' })).toBeUndefined();
		observer.close();
	});
});

describe('Observer extension stats', () => {
	it('keeps the last data, writes it to its sink, and ends the sink when the observer closes', () => {
		const observer = new Observer();
		const sink = observer.createExtensionStats({ id: 'worker-1', createSink: [ InMemorySink, {} ] })!;

		observer.acceptExtensionStats('worker-1', { cpu: 12 });

		expect(observer.getExtensionStats('worker-1')).toEqual({ cpu: 12 });
		expect(observer.sinks.get('worker-1')).toBe(sink);
		expect(records(sink)).toEqual([ { cpu: 12 } ]);

		observer.close();
		expect(sink.ended).toBe(true);
		observer.acceptExtensionStats('worker-1', { cpu: 99 });
		expect(observer.getExtensionStats('worker-1')).toEqual({ cpu: 12 });
	});
});

describe('ExtensionStatsRegistry.close', () => {
	it('ends only the extension stats sinks of its owner', () => {
		const observer = new Observer({ closeCallIfEmptyForMs: undefined });
		const call = observer.createObservedCall({ callId: 'call-1' })!;
		const statsSink = observer.createExtensionStats({ id: 'worker-1', createSink: [ InMemorySink, {} ] })!;
		const otherSink = observer.sinks.create(InMemorySink, { id: 'other' })!;
		const callSink = call.createExtensionStats({ id: 'sfu', createSink: [ InMemorySink, {} ] })!;

		observer.extensionStats.close();

		expect(statsSink.ended).toBe(true);
		expect([ otherSink.ended, callSink.ended ]).toEqual([ false, false ]);
		expect(observer.createExtensionStats({ id: 'late' })).toBeUndefined();
		observer.close();
		expect([ otherSink.ended, callSink.ended ]).toEqual([ true, true ]);
	});
});
