import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Env: `.env.production` for `npm run build`, `.env` / `.env.local` for local dev.
// Vite loads `.env`, then `.env.[mode]` from envDir (repo root by default).
// Staging preview uses the same production Supabase project (no separate staging mode).
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
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/node_modules/')) return;
          if (
            path.includes('/node_modules/react-dom/') ||
            path.includes('/node_modules/react/') ||
            path.includes('/node_modules/scheduler/') ||
            path.includes('/node_modules/react-router') ||
            path.includes('/node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }
          if (path.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          if (path.includes('/node_modules/recharts/') || path.includes('/node_modules/d3-')) {
            return 'vendor-charts';
          }
          if (
            path.includes('/node_modules/exceljs/') ||
            path.includes('/node_modules/xlsx/') ||
            path.includes('/node_modules/file-saver/') ||
            path.includes('/node_modules/papaparse/')
          ) {
            return 'vendor-xlsx';
          }
          if (
            path.includes('/node_modules/jspdf') ||
            path.includes('/node_modules/html2canvas/') ||
            path.includes('/node_modules/pdf-lib/') ||
            path.includes('/node_modules/@signpdf/')
          ) {
            return 'vendor-pdf';
          }
          if (path.includes('/node_modules/lucide-react/') || path.includes('/node_modules/react-icons/')) {
            return 'vendor-icons';
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
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
