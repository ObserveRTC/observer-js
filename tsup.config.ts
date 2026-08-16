import { defineConfig } from 'tsup';

export default defineConfig({
	// Single entry point: the whole server-side library, sinks included.
	entry: {
		index: 'src/index.ts',
	},
	// Dual output: ESM (.mjs) for `import`, CommonJS (.js) for `require()`-based consumers
	// (e.g. CommonJS TypeScript projects whose `import` compiles to `require`).
	format: ['esm', 'cjs'],
	// Emit .d.ts (for the CJS entry) and .d.mts (for the ESM entry) type declarations.
	dts: true,
	sourcemap: true,
	clean: true,
	// Node-only, stated explicitly rather than left to the default: this library reads `getStats()`
	// samples on a server and has no browser build. `tsconfig.json` matches — no `dom` lib.
	platform: 'node',
	target: 'node22',
	splitting: false,
	outDir: 'dist',
});
