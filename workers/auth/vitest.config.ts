import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // The Worker has no bindings yet; tests stub `fetch` and pass `env`
        // explicitly to the handler, so an empty wrangler config is fine.
        miniflare: {
          compatibilityDate: "2024-12-30",
          compatibilityFlags: ["nodejs_compat"],
        },
      },
    },
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
