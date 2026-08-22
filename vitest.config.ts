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
      exclude: ['src/**/*.test.ts', 'src/**/*.test-d.ts', 'src/openapi/fixtures/**'],
      reporter: ['text', 'text-summary', 'html', 'json'],
      thresholds: {
        statements: 92,
        branches: 88,
        functions: 95,
        lines: 92,
      },
    },
  },
});
