// Internal barrel for the sinks, re-exported from the package root.
export type { Sink, SinkEvents, SinkSettings, SinkDestination, ClientSinkParams } from './Sink';
export { SinkRegistry } from './SinkRegistry';
export type { SinkConstructor, SinkCreateSettings } from './SinkRegistry';
export type { ClientSampleSink, ClientSampleSinkEvents } from './ClientSampleSink';
export { JsonlFileSink, createJsonlFileSink } from './JsonlFileSink';
export type { JsonlFileSinkOptions } from './JsonlFileSink';
export { RollingJsonlFileSink } from './RollingJsonlFileSink';
export type { RollingJsonlFileSinkOptions, RollingJsonlFileSinkEvents, RollingJsonlFileInfo } from './RollingJsonlFileSink';
export { InMemorySink, createInMemorySink } from './InMemorySink';
export { ExtensionStatsRegistry } from './ExtensionStatsRegistry';
export type { CreateExtensionStatsSettings } from './ExtensionStatsRegistry';
