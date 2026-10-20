import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Observer } from '../src/Observer';
import { RollingJsonlFileSink } from '../src/sinks/RollingJsonlFileSink';

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolling-'));
});
afterEach(() => {
	jest.restoreAllMocks();
	fs.rmSync(dir, { recursive: true, force: true });
});

const fileOf = (index: number) => path.join(dir, `stats-${index}.jsonl`);
const readLines = (file: string) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

/** End the sink and collect every `file-closed`, resolving on `close` (after the last file). */
function endAndCollect<T>(sink: RollingJsonlFileSink<T>, closed: { path: string, index: number }[]) {
	return new Promise<void>((resolve) => {
		sink.once('close', () => resolve());
		sink.end();
	}).then(() => closed);
}

describe('RollingJsonlFileSink', () => {
	it('rolls before a write that would exceed maxBytes, keeping every record in exactly one file', async () => {
		const closed: { path: string, index: number }[] = [];
		// Each line is `{"n":<digit>}\n` = 8 bytes: two lines per 16-byte file.
		const sink = new RollingJsonlFileSink<{ n: number }>({ path: ({ index }) => fileOf(index), maxBytes: 16 });

		sink.on('file-closed', (path, index) => {
			closed.push({ path, index });
		});
		for (let n = 0; n < 5; ++n) expect(sink.write({ n })).toBe(true);

		expect(sink.index).toBe(2);
		await endAndCollect(sink, closed);

		expect(closed).toEqual([ { path: fileOf(0), index: 0 }, { path: fileOf(1), index: 1 }, { path: fileOf(2), index: 2 } ]);
		expect(readLines(fileOf(0))).toEqual([ { n: 0 }, { n: 1 } ]);
		expect(readLines(fileOf(1))).toEqual([ { n: 2 }, { n: 3 } ]);
		expect(readLines(fileOf(2))).toEqual([ { n: 4 } ]);
	});

	it('rolls on write once the file has been open for maxAgeMs, never while idle', async () => {
		let now = 1_000_000;

		jest.spyOn(Date, 'now').mockImplementation(() => now);

		const opened: number[] = [];
		const sink = new RollingJsonlFileSink({
			path: ({ index, openedAt }) => {
				opened.push(openedAt);

				return fileOf(index);
			},
			maxAgeMs: 60_000,
		});

		sink.write({ n: 1 });
		now += 59_999;
		sink.write({ n: 2 });
		expect(sink.index).toBe(0);

		// An hour of silence: no file is opened until something is written.
		now += 3_600_000;
		expect(sink.index).toBe(0);
		sink.write({ n: 3 });
		expect(sink.index).toBe(1);
		expect(opened).toEqual([ 1_000_000, 1_000_000 + 59_999 + 3_600_000 ]);

		await endAndCollect(sink, []);
		expect(readLines(fileOf(0))).toEqual([ { n: 1 }, { n: 2 } ]);
		expect(readLines(fileOf(1))).toEqual([ { n: 3 } ]);
	});

	it('rolls on roll(), which is a no-op on an empty file; refuses writes once ended', async () => {
		const closed: { path: string, index: number }[] = [];
		const sink = new RollingJsonlFileSink({ path: ({ index }) => fileOf(index) });

		sink.on('file-closed', (path, index) => {
			closed.push({ path, index });
		});
		sink.roll();
		expect(sink.index).toBe(0);

		sink.write({ n: 1 });
		sink.roll();
		expect(sink.index).toBe(1);
		expect(sink.path).toBe(fileOf(1));
		sink.write({ n: 2 });

		await endAndCollect(sink, closed);

		expect(sink.ended).toBe(true);
		expect(sink.write({ n: 3 })).toBe(false);
		sink.roll();
		expect(closed.map((file) => file.index)).toEqual([ 0, 1 ]);
		expect(readLines(fileOf(1))).toEqual([ { n: 2 } ]);
	});

	it('works as an observer extension stats sink, ended when the observer closes', async () => {
		const observer = new Observer();
		const sink = new RollingJsonlFileSink({ id: 'sfu-cpu', path: ({ index }) => fileOf(index), maxBytes: 30 });

		expect(observer.createExtensionStats({ id: 'sfu-cpu', sink })).toBe(sink);

		const closed: number[] = [];

		sink.on('file-closed', (_path, index) => {
			closed.push(index);
		});

		for (let cpu = 10; cpu < 13; ++cpu) observer.acceptExtensionStats('sfu-cpu', { cpu });

		const done = new Promise<void>((resolve) => sink.once('close', () => resolve()));

		observer.close();
		await done;

		expect(closed).toEqual([ 0, 1 ]);
		expect([ ...readLines(fileOf(0)), ...readLines(fileOf(1)) ]).toEqual([ { cpu: 10 }, { cpu: 11 }, { cpu: 12 } ]);
	});
});
