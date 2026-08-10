import { defineConfig } from 'vite';

const buildTime = new Date().toISOString();

export default defineConfig({
    root: '.',
    define: { __ZOLOS_BUILD_TIME__: JSON.stringify(buildTime) },
    plugins: [{
        name: 'zolos-build-timestamp',
        transformIndexHtml() {
            return [{ tag: 'meta', attrs: { name: 'zolos-build-time', content: buildTime }, injectTo: 'head' }];
        },
    }],
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
