import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InMemorySink, createInMemorySink } from '../src/sinks/InMemorySink';
import { JsonlFileSink, createJsonlFileSink } from '../src/sinks/JsonlFileSink';
import { Observer } from '../src/Observer';
import { makeSample } from './helpers/samples';

describe('InMemorySink', () => {
	it('stores the accepted sample objects and emits close on end()', () => {
		const sink = createInMemorySink();

		expect(sink).toBeInstanceOf(InMemorySink);

		const a = makeSample({ clientId: 'a' });
		const b = makeSample({ clientId: 'b' });

		expect(sink.write(a)).toBe(true);
		expect(sink.write(b)).toBe(true);
		expect(sink.samples).toEqual([ a, b ]);

		let closed = false;

		sink.on('close', () => { closed = true; });
		sink.end();

		expect(closed).toBe(true);
	});
});

describe('JsonlFileSink', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-jsonl-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const flush = (sink: JsonlFileSink) => new Promise<void>((resolve, reject) => {
		sink.once('error', reject);
		sink.once('close', () => resolve());
		sink.end();
	});

	it('exposes its path and writes one JSON line per sample', async () => {
		const filePath = path.join(dir, 'out.jsonl');
		const sink = new JsonlFileSink({ path: filePath });

		expect(sink.path).toBe(filePath);

		sink.write(makeSample({ clientId: 'a' }));
		sink.write(makeSample({ clientId: 'b' }));
		await flush(sink);

		const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');

		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0]).clientId).toBe('a');
		expect(JSON.parse(lines[1]).clientId).toBe('b');
	});

	it('uses a custom serializeSample', async () => {
		const filePath = path.join(dir, 'custom.jsonl');
		const sink = new JsonlFileSink({ path: filePath, serializeSample: (s) => `id=${s.clientId}` });

		sink.write(makeSample({ clientId: 'zed' }));
		await flush(sink);

		expect(fs.readFileSync(filePath, 'utf8').trim()).toBe('id=zed');
	});

	it('saveClientSamples.jsonlPath: each client writes its samples to the JSONL file at the returned path, announced by client-sink-created', async () => {
		const observer = new Observer({
			saveClientSamples: {
				jsonlPath: ({ observedCall, clientId }) => (clientId === 'skip' ? undefined : path.join(dir, `${observedCall.callId}__${clientId}.jsonl`)),
			},
		});
		const created: JsonlFileSink[] = [];

		observer.on('client-sink-created', ({ sink }) => created.push(sink as JsonlFileSink));
		observer.accept(makeSample({ callId: 'cid', clientId: 'cl' }));
		observer.accept(makeSample({ callId: 'cid', clientId: 'skip' }));

		const call = observer.getObservedCall('cid')!;

		expect(created.map((s) => s.path)).toEqual([ path.join(dir, 'cid__cl.jsonl') ]);
		expect(call.sinks.get('cl')).toBe(created[0]);
		expect(call.getObservedClient('skip')?.sink).toBeUndefined();

		const flushed = flush(created[0]);

		observer.close();
		await flushed;

		const lines = fs.readFileSync(path.join(dir, 'cid__cl.jsonl'), 'utf8').trim().split('\n');

		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]).clientId).toBe('cl');
	});

	it('saveClientSamples.sink: uses the returned sink when its id is the given id (the client id), ends it otherwise', () => {
		const sinks: InMemorySink[] = [];
		const ids: string[] = [];
		const observer = new Observer({
			saveClientSamples: { sink: ({ id, clientId }) => {
				ids.push(id);
				const sink = new InMemorySink({ id: clientId === 'wrong' ? 'not-the-client-id' : id });

				sinks.push(sink);

				return sink;
			} },
		});

		observer.accept(makeSample({ callId: 'c', clientId: 'ok' }));
		observer.accept(makeSample({ callId: 'c', clientId: 'wrong' }));

		const call = observer.getObservedCall('c')!;

		expect(call.getObservedClient('ok')?.sink).toBe(sinks[0]);
		expect(call.sinks.get('ok')).toBe(sinks[0]);
		expect(ids).toEqual([ 'ok', 'wrong' ]);
		expect(sinks[0].samples).toHaveLength(1);
		expect(call.getObservedClient('wrong')?.sink).toBeUndefined();
		expect(sinks[1].ended).toBe(true);
		observer.close();
	});

	it('saveClientSamples with both jsonlPath and sink (from JavaScript) saves nothing', () => {
		let called = 0;
		const config = {
			jsonlPath: () => { ++called; return path.join(dir, 'both.jsonl'); },
			sink: ({ id }: { id: string }) => { ++called; return new InMemorySink({ id }); },
		};
		// Only reachable without the type check: the config type makes both a compile error.
		const observer = new Observer({ saveClientSamples: config as unknown as { jsonlPath: () => string } });

		observer.accept(makeSample({ callId: 'c', clientId: 'x' }));

		expect(observer.getObservedCall('c')?.getObservedClient('x')?.sink).toBeUndefined();
		expect(called).toBe(0);
		expect(fs.existsSync(path.join(dir, 'both.jsonl'))).toBe(false);
		observer.close();
	});

	it('saveClientSamples is not called for a client whose id is already a sink id in another call', () => {
		const observer = new Observer({
			saveClientSamples: {
				jsonlPath: ({ observedCall, clientId }) => path.join(dir, `${observedCall.callId}__${clientId}.jsonl`),
			},
		});

		observer.accept(makeSample({ callId: 'c1', clientId: 'dup' }));
		observer.accept(makeSample({ callId: 'c2', clientId: 'dup' }));

		expect(observer.getObservedCall('c1')?.getObservedClient('dup')?.sink).toBeDefined();
		expect(observer.getObservedCall('c2')?.getObservedClient('dup')?.sink).toBeUndefined();
		expect(fs.existsSync(path.join(dir, 'c2__dup.jsonl'))).toBe(false);
		observer.close();
	});

	it('createJsonlFileSink builds a JsonlFileSink', async () => {
		const sink = createJsonlFileSink({ path: path.join(dir, 'x.jsonl') });

		expect(sink).toBeInstanceOf(JsonlFileSink);
		await flush(sink as JsonlFileSink);
	});
});
