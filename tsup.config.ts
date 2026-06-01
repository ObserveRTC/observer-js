import { defineConfig } from 'tsup';

export default defineConfig({
	// Single entry point: the whole server-side library, sinks included.
	entry: {
		index: 'src/index.ts',
	},
	// ESM only (Node >= 16).
	format: ['esm'],
	// Emit .d.ts type declarations.
	dts: true,
	sourcemap: true,
	clean: true,
	target: 'node16',
	splitting: false,
	outDir: 'dist',
});
