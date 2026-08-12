import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/examples/**',
      '**/.tmp/**',
      '**/website/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts'],
      reporter: ['text', 'text-summary', 'html'],
      thresholds: {
        statements: 88,
        branches: 83,
        functions: 95,
        lines: 88,
      },
    },
  },
});
