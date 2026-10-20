import type { Sink, SinkEvents } from './Sink';
import type { ClientSample } from '../schema/ClientSample';

/** The lifecycle events a client sample sink may emit. Same as {@link SinkEvents}. */
export type ClientSampleSinkEvents = SinkEvents;

/**
 * A per-client destination for accepted samples. Return one from `ObserverConfig.saveClientSamples.sink`
 * (with the `id` it receives), or create one under the client id with
 * `observedCall.sinks.create(MySink, { id: clientId, ... })`.
 *
 * The library calls `write(sample)` synchronously per accepted sample (not awaited) and `end()`s
 * the sink when the client closes; the registry attaches an `error` listener so a failing sink
 * can't crash the process. Because `write` isn't awaited, backpressure and batching are the sink's
 * concern.
 */
export type ClientSampleSink = Sink<ClientSample>;
