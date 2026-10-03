import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("development origin policy", () => {
  it("allows the W365 Tailscale Serve hostname only", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(["w365.azules-panga.ts.net"]);
  });
});
