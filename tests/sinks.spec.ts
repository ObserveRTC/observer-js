import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InMemorySink, createInMemorySink } from '../src/sinks/InMemorySink';
import { JsonlFileSink, createJsonlFileSink, createJsonlFileSinkFactory } from '../src/sinks/JsonlFileSink';
import type { ObservedCall } from '../src/ObservedCall';
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

	it('factory derives the per-client file path from callId/clientId', async () => {
		const factory = createJsonlFileSinkFactory({ directory: dir });
		const sink = factory({ clientId: 'cl', observedCall: { callId: 'cid' } as ObservedCall }) as JsonlFileSink;

		expect(sink.path).toBe(path.join(dir, 'cid__cl.jsonl'));
		await flush(sink);
	});

	it('createJsonlFileSink builds a JsonlFileSink', async () => {
		const sink = createJsonlFileSink({ path: path.join(dir, 'x.jsonl') });

		expect(sink).toBeInstanceOf(JsonlFileSink);
		await flush(sink as JsonlFileSink);
	});
});
