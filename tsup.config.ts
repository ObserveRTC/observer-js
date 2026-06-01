import { defineConfig } from 'tsup';

export default defineConfig({
	// Two public entry points: the import-safe core (`.`) and the Node-only sinks (`./sinks`).
	entry: {
		index: 'src/index.ts',
		'sinks/index': 'src/sinks/index.ts',
	},
	// ESM only: lets browser bundlers tree-shake the ~50 Observed* classes, and is the
	// modern format for Node (>=16) and every browser build tool.
	format: ['esm'],
	// Emit .d.ts type declarations for both entries.
	dts: true,
	sourcemap: true,
	clean: true,
	// Browser-friendly target; the core has no Node globals.
	target: 'es2020',
	// Hoist code shared by the two entries (e.g. the ClientSampleSink base class) into a
	// single chunk, so `sink instanceof ClientSampleSink` holds and nothing is duplicated.
	splitting: true,
	outDir: 'dist',
});
