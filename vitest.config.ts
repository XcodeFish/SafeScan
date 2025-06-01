import { resolve } from 'path';
// import { defineConfig } from 'vitest';

export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'packages/*/src/**/*.d.ts',
        'packages/*/src/**/types.ts',
        'packages/*/src/**/index.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@safescan/core': resolve(__dirname, 'packages/core/src'),
      '@safescan/plugins': resolve(__dirname, 'packages/plugins/src'),
      '@safescan/integrations': resolve(__dirname, 'packages/integrations/src'),
      '@safescan/rules': resolve(__dirname, 'packages/rules/src'),
    },
  },
};
