import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
