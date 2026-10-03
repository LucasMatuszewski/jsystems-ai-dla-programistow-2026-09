import { afterEach, vi } from "vitest";

// No service, filesystem, Sharp or server-only replacement belongs here.
// Individual integration tests may replace only the external LLM HTTP boundary.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
