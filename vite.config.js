import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    // Strip console.* and debugger statements from production bundles so the
    // devtools console doesn't leak player data, positions, or internals.
    // (console.error/warn stay available in dev via `npm run dev`.)
    esbuild: {
        drop: ['console', 'debugger'],
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
    server: {
        port: 3000,
        open: false,
    },
});
