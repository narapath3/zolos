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
        // Split the third-party libraries out of the app chunk. The total first
        // load is unchanged, but three.js/Supabase/Socket.io only change when we
        // bump a dependency, so returning players keep them from cache across
        // the several app deploys we ship most days instead of re-downloading
        // ~1.3 MB every time a UI string moves.
        rollupOptions: {
            output: {
                advancedChunks: {
                    groups: [
                        { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/ },
                        { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/ },
                        {
                            name: 'vendor-socketio',
                            test: /node_modules[\\/](socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser|@socket\.io)[\\/]/,
                        },
                    ],
                },
            },
        },
    },
    server: {
        port: 3000,
        open: false,
    },
});
