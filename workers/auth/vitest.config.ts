import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // The Worker has no bindings yet; tests stub `fetch` and pass `env`
      // explicitly to the handler, so an empty miniflare config is fine.
      miniflare: {
        compatibilityDate: "2026-04-01",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  test: {
    coverage: {
      // istanbul, not v8: the @cloudflare/vitest-pool-workers runtime
      // (workerd) doesn't expose `node:inspector`, which v8 coverage needs.
      provider: "istanbul",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
