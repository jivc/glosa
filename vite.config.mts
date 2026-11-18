import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000, target: 'es2022' },
  test: { environment: 'node' },
} as any);
