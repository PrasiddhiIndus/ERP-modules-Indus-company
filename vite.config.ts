import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Env: `.env.production` for `npm run build`, `.env.staging` for `npm run build:staging` / `dev:staging`.
// Vite loads `.env`, then `.env.[mode]` from envDir (repo root by default).
export default defineConfig({
  envDir: '.',
  plugins: [
    react(),
    {
      name: 'html-no-cache-hints',
      transformIndexHtml(html) {
        // Helps some browsers avoid sticky cached shells after deploys.
        if (html.includes('http-equiv="Cache-Control"')) return html;
        return html.replace(
          /<head>/i,
          `<head>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />`
        );
      },
    },
  ],
  resolve: {
    // Single React instance so Context (e.g. BillingProvider) is not null in child hooks.
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('lucide-react')) return 'vendor-icons';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      '/api': {
        // Use IPv4 loopback to avoid Windows localhost resolving to ::1 while
        // the Express server is listening on IPv4.
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
    },
  },
});
