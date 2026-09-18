import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies /api to the API process so the browser sees a single
// origin locally, exactly as it does behind CloudFront in beta and prod. That
// keeps the session cookie first-party in every environment: no CORS, no
// SameSite surprises, and no environment-specific API URL baked into the build.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
    // Codespaces forwards the port through *.app.github.dev over TLS, so the
    // HMR websocket has to come back through 443 rather than the dev port.
    allowedHosts: ['.app.github.dev'],
    hmr: process.env.CODESPACES ? { clientPort: 443 } : undefined,
  },
});
