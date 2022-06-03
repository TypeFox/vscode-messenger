import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    mode: 'development',
    plugins: [react()],
    build: {
        outDir: 'build',
        sourcemap: true,
        target: 'esnext',
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
                sourcemap: true
            },
        },
        minify: 'esbuild'
    },
});
