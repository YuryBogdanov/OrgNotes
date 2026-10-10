import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
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
