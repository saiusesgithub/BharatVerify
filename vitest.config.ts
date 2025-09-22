import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      enabled: false
    },
    setupFiles: [],
    exclude: ['frontend/tests/**']
  }
});
