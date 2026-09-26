import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    // Browser code uses relative /api URLs; in development they are proxied to server/dev.ts.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', xfwd: true } },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', xfwd: true } },
  },
});
