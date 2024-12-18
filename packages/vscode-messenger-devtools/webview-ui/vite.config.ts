import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
    mode: 'development',
    plugins: [
        react(),
    ],
    assetsInclude: [
        '**/codicon.css',
    ],
    resolve: {
        // otherwise rollup fails to resolve exported vscode-messenger-webview types
        preserveSymlinks: true
    },
    build: {
        outDir: 'build',
        sourcemap: true,
        target: 'esnext',
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
                sourcemapBaseUrl: `file://${resolve(__dirname)}/build/assets/`, // <-- resolves tsx sources in debugger
                sourcemap: true
            },
        },
        minify: 'esbuild'
    },
});
