import * as fs from 'fs';
import * as path from 'path';
import { ClientSampleSink, ClientSampleSinkFactory } from './ClientSampleSink';
import type { ClientSample } from '../schema/ClientSample';

export type JsonlFileSinkOptions = {

	/** Absolute or relative file path to append JSONL lines to. */
	path: string,

	/** Optional custom serializer; defaults to `JSON.stringify`. */
	serializeSample?: (sample: ClientSample) => string,
};

/**
 * A sink that serializes each sample to a JSON line and appends it to a file. It wraps an
 * `fs.WriteStream` and re-emits its lifecycle events, so `close` fires once the file is flushed
 * and its descriptor is closed (file ready) and `error` surfaces file errors.
 */
export class JsonlFileSink extends ClientSampleSink {
	/** The file this sink writes to. Read it (e.g. in a `close` handler) to upload/move the file. */
	public readonly path: string;

	private readonly _stream: fs.WriteStream;
	private readonly _serializeSample: (sample: ClientSample) => string;

	public constructor(options: JsonlFileSinkOptions) {
		super();
		this.path = options.path;
		this._stream = fs.createWriteStream(this.path, { flags: 'a' });

		this._stream.on('close', () => this.emit('close'));
		this._stream.on('finish', () => this.emit('finish'));
		this._stream.on('drain', () => this.emit('drain'));
		this._stream.on('error', (err) => this.emit('error', err));

		this._serializeSample = options.serializeSample ?? ((sample) => JSON.stringify(sample));
	}

	public write(sample: ClientSample): boolean {
		return this._stream.write(`${this._serializeSample(sample)}\n`);
	}

	public end(): void {
		this._stream.end();
	}
}

/** Build a JSONL file sink for a single path. */
export function createJsonlFileSink(options: JsonlFileSinkOptions): ClientSampleSink {
	return new JsonlFileSink(options);
}

export type JsonlFileSinkFactoryOptions = {

	/** Directory the per-client files are written into (must exists). */
	directory: string,

	/** Builds the file name from the call/client ids. Defaults to `${callId}__${clientId}.jsonl`. */
	getFileName?: (params: { callId: string, clientId: string }) => string,

	/** Optional custom serializer; defaults to `JSON.stringify`. */
	serializeSample?: (sample: ClientSample) => string,
};

/**
 * Convenience factory that writes one JSONL file per client, with the path derived from
 * `callId` / `clientId`. Plug into `ObserverConfig.createClientSink`.
 */
export function createJsonlFileSinkFactory(options: JsonlFileSinkFactoryOptions): ClientSampleSinkFactory {

	return ({ clientId, observedCall }) => {
		const filename = options.getFileName?.({ callId: observedCall.callId, clientId }) ?? `${observedCall.callId}__${clientId}.jsonl`;

		return createJsonlFileSink({
			path: path.join(options.directory, filename),
			serializeSample: options.serializeSample,
		});
	};
}
