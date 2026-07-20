import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Builds the drag-and-drop playground (GitHub Pages) from playground/,
// bundling the library straight from src/ so the demo always matches the
// code in the repo.
export default defineConfig({
  root: 'playground',
  base: '/svg-icon-tool/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 43120,
    strictPort: true,
  },
  preview: {
    port: 43121,
    strictPort: true,
  },
});
