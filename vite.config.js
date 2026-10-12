import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte()],
  // the plugins' API (ТЗ 26): the only module a plugin imports
  resolve: {
    alias: [
      { find: /^@panopticon\/api$/, replacement: fileURLToPath(new URL('./src/api/index.ts', import.meta.url)) },
      { find: /^@panopticon\/api\/org$/, replacement: fileURLToPath(new URL('./src/api/org.ts', import.meta.url)) },
    ],
  },
  test: { include: ['src/**/*.test.ts'] },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // The app edits notes on disk (autosave). When the notes folder is inside the project, a changed note must not
    // hot-reload the UI: that recreates the app and throws the cursor back to the first line.
    watch: { ignored: ['**/sample-notes/**', '**/test-results/**', '**/playwright-report/**'] },
  },
});
