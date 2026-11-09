import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __LAQTA_DEV_PROVIDER__: 'false' },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
