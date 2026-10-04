import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * Flat config. eslint-config-next 16 ships flat config directly, so no
 * FlatCompat shim is needed.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'content/schema/*.json',
    ],
  },
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // src/core is the pure domain layer: planner, scheduler, content rules. It must
    // stay framework-free so it can be unit tested without a browser or a database.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*', '@/lib/supabase/*', '@/lib/db/*', 'postgres'],
              message: 'src/core phải thuần: không import React, Next hay lớp dữ liệu. Xem docs/ARCHITECTURE.md.',
            },
          ],
        },
      ],
    },
  },
);
