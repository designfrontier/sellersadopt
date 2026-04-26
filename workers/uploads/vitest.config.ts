import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        compatibilityDate: '2026-04-01',
        bindings: {
          R2_ACCESS_KEY_ID: 'test-access-key-id',
          R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
          R2_ACCOUNT_ID: 'test-account-id',
          R2_BUCKET: 'sellers-uploads-test',
          ALLOWED_GITHUB_USERS: 'designfrontier,kksellers',
          PUBLIC_BASE_URL: 'https://uploads.sellersadopt.com',
          ALLOWED_ORIGINS:
            'https://sellersadopt.com,http://localhost:4321',
        },
      },
    }),
  ],
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
});
