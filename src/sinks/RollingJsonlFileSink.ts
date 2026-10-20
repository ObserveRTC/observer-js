import * as fs from 'fs';
import { EventEmitter } from 'node:events';
import type { Sink, SinkEvents, SinkSettings } from './Sink';

/** The file a `RollingJsonlFileSink` is about to open: the sequence number and when it opens. */
export type RollingJsonlFileInfo = {

	/** 0 for the first file, then 1, 2, … */
	index: number,

	/** `Date.now()` when the file is opened. */
	openedAt: number,
};

export type RollingJsonlFileSinkOptions<T = unknown> = Partial<SinkSettings> & {

	/** The path of each file, called when it is opened. Must give a new path per `index`. */
	path: (file: RollingJsonlFileInfo) => string,

	/** Roll before a write that would make the current file larger than this, in bytes. */
	maxBytes?: number,

	/** Roll before a write once the current file has been open for this long, in ms. */
	maxAgeMs?: number,

	/** Optional custom serializer; defaults to `JSON.stringify`. */
	serializeSample?: (record: T) => string,
};

export type RollingJsonlFileSinkEvents = {
	ended: SinkEvents['ended'];
	close: SinkEvents['close'];
	error: SinkEvents['error'];
	finish: SinkEvents['finish'];
	drain: SinkEvents['drain'];

	/** A file is complete: flushed and its descriptor closed. Fires for every file, the last one included. */
	'file-closed': [path: string, index: number],
};

export declare interface RollingJsonlFileSink {
	on<E extends keyof RollingJsonlFileSinkEvents>(event: E, listener: (...args: RollingJsonlFileSinkEvents[E]) => void): this;
	once<E extends keyof RollingJsonlFileSinkEvents>(event: E, listener: (...args: RollingJsonlFileSinkEvents[E]) => void): this;
	off<E extends keyof RollingJsonlFileSinkEvents>(event: E, listener: (...args: RollingJsonlFileSinkEvents[E]) => void): this;
	emit<E extends keyof RollingJsonlFileSinkEvents>(event: E, ...args: RollingJsonlFileSinkEvents[E]): boolean;
}

/**
 * A JSONL file sink for long-lived owners (e.g. an observer's extension stats over days): it writes
 * to a sequence of files, closing the current one and opening the next — *rolling* — when it would
 * exceed `maxBytes`, when it has been open for `maxAgeMs`, or when `roll()` is called. Nothing is
 * dropped: each record goes to exactly one file.
 *
 * The limits are checked on `write`, so a file is never rolled while nothing is written to it, and
 * an empty file is never rolled. `file-closed` announces each finished file (ready to upload or
 * move), in index order; `close` fires once, after every file is closed by `end()`.
 */
export class RollingJsonlFileSink<T = unknown> extends EventEmitter implements Sink<T> {
	public readonly id: string;

	private readonly _options: RollingJsonlFileSinkOptions<T>;
	private readonly _serializeSample: (record: T) => string;
	private _stream!: fs.WriteStream;
	private _path!: string;
	private _index = -1;
	private _openedAt = 0;
	private _bytes = 0;
	private _ended = false;
	// Resolves once every file closed so far has closed and been announced, in index order: the
	// streams close independently, so a later file could otherwise be announced before an earlier one.
	private _closing: Promise<void> = Promise.resolve();

	public constructor(options: RollingJsonlFileSinkOptions<T>) {
		super();
		this._options = options;
		this._serializeSample = options.serializeSample ?? ((record) => JSON.stringify(record));
		this._open();
		// A registry always passes an id; a standalone sink falls back to its first path.
		this.id = options.id ?? this._path;
	}

	/** The file currently written to. */
	public get path(): string {
		return this._path;
	}

	/** The index of the file currently written to. */
	public get index(): number {
		return this._index;
	}

	public get ended(): boolean {
		return this._ended;
	}

	public write(record: T): boolean {
		if (this._ended) return false;

		const line = `${this._serializeSample(record)}\n`;
		const bytes = Buffer.byteLength(line);
		const { maxBytes, maxAgeMs } = this._options;

		if (maxAgeMs !== undefined && maxAgeMs <= Date.now() - this._openedAt) this.roll();
		if (maxBytes !== undefined && maxBytes < this._bytes + bytes) this.roll();

		this._bytes += bytes;

		return this._stream.write(line);
	}

	/** Close the current file and continue in a new one. A no-op on an empty file or an ended sink. */
	public roll(): void {
		if (this._ended || this._bytes === 0) return;

		this._closeCurrent();
		this._open();
	}

	/** No more writes: emits `ended`, closes the current file (`file-closed`), then emits `close`. */
	public end(): void {
		if (this._ended) return;

		this._ended = true;
		this.emit('ended');
		this._closeCurrent();
		void this._closing.then(() => {
			this.emit('finish');
			this.emit('close');
		});
	}

	private _open(): void {
		++this._index;
		this._openedAt = Date.now();
		this._bytes = 0;
		this._path = this._options.path({ index: this._index, openedAt: this._openedAt });

		const stream = fs.createWriteStream(this._path, { flags: 'a' });

		stream.on('drain', () => this.emit('drain'));
		stream.on('error', (err) => this.emit('error', err));
		this._stream = stream;
	}

	private _closeCurrent(): void {
		const stream = this._stream;
		const path = this._path;
		const index = this._index;
		// 'error' also ends the wait: a failed file is reported through 'error' and still announced.
		const closed = new Promise<void>((resolve) => {
			stream.once('close', () => resolve());
			stream.once('error', () => resolve());
		});

		this._closing = Promise.all([ this._closing, closed ]).then(() => {
			this.emit('file-closed', path, index);
		});
		stream.end();
	}
}
