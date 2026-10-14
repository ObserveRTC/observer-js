// Internal barrel for the sinks, re-exported from the package root.
export type { Sink, SinkEvents, SinkSettings } from './Sink';
export { SinkRegistry } from './SinkRegistry';
export type { ClientSampleSink, ClientSampleSinkEvents } from './ClientSampleSink';
export { JsonlFileSink, createJsonlFileSink } from './JsonlFileSink';
export type { JsonlFileSinkOptions } from './JsonlFileSink';
export { InMemorySink, createInMemorySink } from './InMemorySink';
