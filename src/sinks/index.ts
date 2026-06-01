// Concrete sink helpers. Importing this entry pulls in Node's `fs` (via the file sink),
// so it is Node-only — import it from server code, never from a browser/edge bundle.
// The sink *interface* (`ClientSampleSink`) lives in the package root and is import-safe
// everywhere; browser apps provide their own object that satisfies it.
export { createJsonlFileSink, createJsonlFileSinkFactory } from './JsonlFileSink';
export type { JsonlFileSinkOptions, JsonlFileSinkFactoryOptions } from './JsonlFileSink';
export { InMemorySink, createInMemorySink } from './InMemorySink';
