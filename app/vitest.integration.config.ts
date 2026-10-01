import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  ssr: { resolve: { conditions: ["node", "development|production", "react-server"] } },
  test: {
    name: "integration",
    environment: "node",
    pool: "forks",
    include: ["tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup-integration.ts"],
    restoreMocks: true,
    mockReset: true,
    clearMocks: true,
  },
});
