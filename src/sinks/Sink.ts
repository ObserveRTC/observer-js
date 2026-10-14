/** The lifecycle events a sink emits. */
export type SinkEvents = {

	/**
	 * `end()` was called: the sink accepts no more writes. **Required**: a sink emits it
	 * synchronously, once, from `end()` — it is how its registry removes it and frees its id.
	 */
	ended: [];

	/** The destination is fully written and closed (e.g. a file flushed and its fd closed). */
	close: [];

	/** The destination failed. */
	error: [Error];

	/** All queued data was flushed (before `close`). */
	finish: [];

	/** The buffer drained after backpressure; safe to write more. */
	drain: [];
};

/** What a registry passes to a sink's constructor. Implementations extend it with their own settings. */
export type SinkSettings = {

	/** Unique per observer. The registry generates one (uuid v4) when it is omitted. */
	id: string;
};

/**
 * A destination for records. It is **object-mode** and agnostic about what passes through it:
 * `write` receives the record itself, and the implementation decides how to serialize it (JSON
 * line, protobuf, a remote payload, …). `JsonlFileSink` and `InMemorySink` are the built-in
 * implementations; `ClientSampleSink` is `Sink<ClientSample>`.
 *
 * Create sinks with a registry's `create(SinkClass, settings)`, which constructs
 * `new SinkClass({ ...settings, id })` and registers it on the object that owns its lifecycle.
 * `end()` closes a sink and — through the `ended` event — removes it from its registry; the owner
 * ends whatever is left when it closes.
 *
 * An implementation typically `extends EventEmitter implements Sink<T>`, and must:
 * - emit `ended` synchronously, once, from `end()` (and make a second `end()` a no-op);
 * - refuse writes after `end()` (return `false`);
 * - emit `close` when the destination is ready, and `error` when it fails.
 */
export interface Sink<T = unknown> {
	readonly id: string;

	/** Accept one record. `false` once ended (nothing written), or on backpressure. */
	write(record: T): boolean;

	/** No more writes; emit `ended`, then flush and emit `close`. Idempotent. */
	end(): void;

	// Listener args are untyped so that a plain `EventEmitter` satisfies the interface; see
	// `SinkEvents` for each event's arguments (the built-in sinks declare them fully typed).
	/* eslint-disable @typescript-eslint/no-explicit-any */
	on(event: keyof SinkEvents, listener: (...args: any[]) => void): this;
	once(event: keyof SinkEvents, listener: (...args: any[]) => void): this;
	off(event: keyof SinkEvents, listener: (...args: any[]) => void): this;
	/* eslint-enable @typescript-eslint/no-explicit-any */
}
