import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: [
    'oxc',
    'jsdoc',
    'node',
    'import',
    'eslint',
    'vitest',
    'unicorn',
    'promise',
    'typescript'
  ],
  options: {
    typeCheck: true,
    typeAware: true,
    reportUnusedDisableDirectives: 'warn'
  },
  env: {
    node: true,
    es2024: true,
    browser: true,
    'shared-node-browser': true
  },
  rules: {
    'sort-keys': 'off'
  },
  overrides: [
    {
      files: ['test/**', '**/**.test.ts', '**/**.test.tsx'],
      rules: {
        'typescript/unbound-method': 'off'
      }
    }
  ],
  ignorePatterns: [
    '**/_/**',
    '.agents',
    '**/dist/**',
    '**/node_modules/**',
    'worker-configuration.d.ts'
  ]
})
