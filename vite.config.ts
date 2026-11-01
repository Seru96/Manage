import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const tauriConf = JSON.parse(readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

// Tauri sirve el frontend desde un puerto fijo en desarrollo (1421: no choca con IMPLANTA Install).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  preview: { headers: { 'Content-Security-Policy': tauriConf.app.security.csp } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: { __APP_VERSION__: JSON.stringify(tauriConf.version) },
  build: {
    // WKWebView (macOS 14+) y WebView2: ES2023 sin transpilar.
    target: 'safari17',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
