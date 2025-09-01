import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'examples/browser',
  server: {
    fs: {
      // Allow serving files from repo root (for ../../dist import)
      allow: [path.resolve(__dirname), path.resolve(__dirname, 'dist')],
    },
  },
});

