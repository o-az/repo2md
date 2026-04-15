import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
    },
    testTimeout: 30_000,
    include: ['test/**/*.test.{ts,tsx}', 'test/**/*.spec.{ts,tsx}'],
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.json',
      },
      miniflare: {
        bindings: {
          DISABLE_CACHE: 'true',
          GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '',
        },
      },
    }),
  ],
})
