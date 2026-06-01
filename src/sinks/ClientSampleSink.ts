import { EventEmitter } from 'events';
import type { ClientSample } from '../schema/ClientSample';
import type { ObservedCall } from '../ObservedCall';

/** The lifecycle events a sink may emit (a subset of Node's writable-stream events). */
export type ClientSampleSinkEvents = {

	/** The destination is fully written and closed (e.g. a file flushed and its fd closed). */
	close: [];

	/** The destination failed. */
	error: [Error];

	/** `end()` was processed and all queued data was flushed (before `close`). */
	finish: [];

	/** The buffer drained after backpressure; safe to write more. */
	drain: [];
};

export declare interface ClientSampleSink {
	on<E extends keyof ClientSampleSinkEvents>(event: E, listener: (...args: ClientSampleSinkEvents[E]) => void): this;
	once<E extends keyof ClientSampleSinkEvents>(event: E, listener: (...args: ClientSampleSinkEvents[E]) => void): this;
	off<E extends keyof ClientSampleSinkEvents>(event: E, listener: (...args: ClientSampleSinkEvents[E]) => void): this;
	emit<E extends keyof ClientSampleSinkEvents>(event: E, ...args: ClientSampleSinkEvents[E]): boolean;
}

/**
 * A per-client destination for accepted samples — a typed `EventEmitter` base class. One sink is
 * created per `ObservedClient` (via `ObserverConfig.createClientSink`). It is **object-mode**:
 * `write` receives the `ClientSample` itself, so each sink decides how to serialize it (JSON
 * line, protobuf, msgpack, a remote payload, …).
 *
 * The library calls `write(sample)` synchronously per accepted sample (not awaited), `end()`s the
 * sink when the client closes, and attaches an `error` listener so a failing sink can't crash the
 * process. The application — which created the sink — listens for `close` (destination ready,
 * e.g. a file flushed and its fd closed) and `error`.
 *
 * Subclass this and implement `write`/`end` (and `emit` your lifecycle events). The library core
 * only references the type, so importing `@observertc/observer-js` stays import-safe; the bundled
 * concrete sinks live in the Node-only `@observertc/observer-js/sinks` subpath.
 */
export abstract class ClientSampleSink extends EventEmitter {
	/** Accept one sample; the sink serializes it however it likes. `false` signals backpressure. */
	public abstract write(sample: ClientSample): boolean;

	/** Finish writing; the sink flushes and (if applicable) emits `close`. */
	public abstract end(): void;
}

/**
 * Produces a sink for a newly-created client, or `undefined` for no sink. Receives the
 * client id and its (already-created) parent call, so the destination can be derived
 * from `callId` / `clientId`.
 */
export type ClientSampleSinkFactory = (params: {
	clientId: string,
	observedCall: ObservedCall,
}) => ClientSampleSink | undefined;
