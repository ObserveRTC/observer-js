import * as fs from 'fs';
import { EventEmitter } from 'node:events';
import type { Sink, SinkEvents, SinkSettings } from './Sink';
import type { ClientSample } from '../schema/ClientSample';

export type JsonlFileSinkOptions<T = ClientSample> = Partial<SinkSettings> & {

	/** Absolute or relative file path to append JSONL lines to. */
	path: string,

	/** Optional custom serializer; defaults to `JSON.stringify`. */
	serializeSample?: (record: T) => string,
};

/**
 * A sink that serializes each record to a JSON line and appends it to a file. Defaults to client
 * samples, but takes any record type: `sinks.create(JsonlFileSink<PipeTransportStats[]>, { id, path })`. It wraps an
 * `fs.WriteStream` and re-emits its lifecycle events, so `close` fires once the file is flushed
 * and its descriptor is closed (file ready) and `error` surfaces file errors.
 */
export declare interface JsonlFileSink {
	on<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	once<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	off<E extends keyof SinkEvents>(event: E, listener: (...args: SinkEvents[E]) => void): this;
	emit<E extends keyof SinkEvents>(event: E, ...args: SinkEvents[E]): boolean;
}

export class JsonlFileSink<T = ClientSample> extends EventEmitter implements Sink<T> {
	public readonly id: string;

	/** The file this sink writes to. Read it (e.g. in a `close` handler) to upload/move the file. */
	public readonly path: string;

	private readonly _stream: fs.WriteStream;
	private readonly _serializeSample: (record: T) => string;
	private _ended = false;

	public constructor(options: JsonlFileSinkOptions<T>) {
		super();
		// A registry always passes an id; a standalone sink falls back to its path.
		this.id = options.id ?? options.path;
		this.path = options.path;
		this._stream = fs.createWriteStream(this.path, { flags: 'a' });

		this._stream.on('close', () => this.emit('close'));
		this._stream.on('finish', () => this.emit('finish'));
		this._stream.on('drain', () => this.emit('drain'));
		this._stream.on('error', (err) => this.emit('error', err));

		this._serializeSample = options.serializeSample ?? ((record) => JSON.stringify(record));
	}

	public get ended(): boolean {
		return this._ended;
	}

	public write(record: T): boolean {
		if (this._ended) return false;

		return this._stream.write(`${this._serializeSample(record)}\n`);
	}

	public end(): void {
		if (this._ended) return;

		this._ended = true;
		this.emit('ended');
		this._stream.end();
	}
}

/** Build a JSONL file sink for a single path. */
export function createJsonlFileSink<T = ClientSample>(options: JsonlFileSinkOptions<T>): JsonlFileSink<T> {
	return new JsonlFileSink<T>(options);
}
