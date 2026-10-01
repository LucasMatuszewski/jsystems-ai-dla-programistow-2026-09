import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    pool: "forks",
    restoreMocks: true,
    mockReset: true,
    clearMocks: true,
    projects: [
      {
        test: {
          name: "browser-unit",
          environment: "jsdom",
          environmentOptions: { jsdom: { url: "http://127.0.0.1:3000" } },
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          exclude: ["tests/unit/backend/**"],
          setupFiles: ["./tests/setup-unit.ts"],
        },
      },
      {
        ssr: { resolve: { conditions: ["node", "development|production", "react-server"] } },
        test: {
          name: "backend-unit",
          environment: "node",
          include: ["tests/unit/backend/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
