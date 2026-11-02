import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// VITE_BASE lets the same build target GitHub Pages (/repo-name/) or a root host (Vercel).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // React stays in the entry chunk; the 3D stack is only fetched by the lazy 3D scenes.
        manualChunks(id) {
          // Vite's preload helper is shared by every lazy import; keep it out of the 3D chunk.
          if (id.includes('vite/preload-helper') || id.includes('modulepreload-polyfill')) return 'react';
          if (!id.includes('node_modules')) return undefined;
          const pkg = id.replace(/\\/g, '/').split('/node_modules/').pop() ?? '';
          if (/^(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(pkg)) return 'react';
          if (/^three\//.test(pkg)) return 'three';
          if (/^(@react-three|three-stdlib|postprocessing|maath|troika|camera-controls|meshline|three-mesh-bvh|@monogrid|stats)/.test(pkg)) return 'r3f';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
