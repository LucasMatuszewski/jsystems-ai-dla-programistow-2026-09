import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), createHash: vi.fn(), update: vi.fn(), digest: vi.fn(), resolve: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("node:crypto", () => ({ createHash: mocks.createHash }));
vi.mock("node:path", () => ({ resolve: mocks.resolve }));
import { getPolicyRegistration, type PolicyScenario } from "../../../src/server/policies/registry";
import { loadPolicy, resolvePolicyReferences } from "../../../src/server/policies/policy-loader";
import { policyMetadataSchema } from "@/lib/contracts/policy";

const complaintDigest = "d69c7b039d520f8e449fc290611bdc2e003bebac87a28b99489c0493737b141a";
describe("allowlisted immutable policy selection", () => {
  beforeEach(() => {
    mocks.resolve.mockImplementation((...parts: string[]) => parts.join("/"));
    mocks.createHash.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ digest: mocks.digest });
    mocks.digest.mockReturnValue(complaintDigest);
    mocks.readFile.mockResolvedValue(Buffer.from("complete source"));
  });
  it("has a callable healthy test harness", () => { expect(loadPolicy).toBeTypeOf("function"); });
  it("selects distinct exact complaint and return versions", () => {
    expect(getPolicyRegistration("complaint").digest).toBe(complaintDigest);
    expect(getPolicyRegistration("return").digest).not.toBe(complaintDigest);
    expect(getPolicyRegistration("complaint", complaintDigest).version).toBe(complaintDigest);
  });
  it.each(["complaint", "return"] as const)("preserves all source retrieval fractional digits in %s public metadata", scenario => {
    const policy = getPolicyRegistration(scenario);
    expect(policy.originalRetrievedAt).toBe("2026-09-30T09:15:03.305782+00:00");
    expect(policy.retrievedAt).toBe("2026-09-30T09:15:03.305782Z");
    expect(policyMetadataSchema.safeParse({ version: policy.version, digest: policy.digest, sourceUrl: policy.sourceUrl, retrievedAt: policy.retrievedAt, references: [] }).success).toBe(true);
  });
  it.each(["../../private", "toString", "__proto__", "refund"])("rejects untrusted scenario %s before any IO", async (scenario) => {
    await expect(loadPolicy(scenario as PolicyScenario)).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("does not replace unknown or cross-scenario captured versions with current", async () => {
    for (const version of ["../arbitrary.html", "", "retired-version", "ab8a4d4c9242ed12345ac38782cba7a793417acc386ed694d23f98ca699870d6"]) {
      await expect(loadPolicy("complaint", version)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
    }
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("returns full bytes decoded as UTF-8 and uses SHA-256 on original bytes", async () => {
    const bytes = Buffer.from("pełny HTML"); mocks.readFile.mockResolvedValue(bytes);
    const result = await loadPolicy("complaint");
    expect(result.html).toBe(bytes.toString("utf8"));
    expect(mocks.createHash).toHaveBeenCalledWith("sha256");
    expect(mocks.update).toHaveBeenCalledWith(bytes);
    expect(mocks.digest).toHaveBeenCalledWith("hex");
    expect(String(mocks.readFile.mock.calls[0][0])).toContain(`complaints.${complaintDigest}.html`);
  });
  it.each(["ENOENT", "EACCES"])("fails current missing/unreadable resource %s operationally", async (code) => {
    mocks.readFile.mockRejectedValue(Object.assign(new Error("filesystem error"), { code }));
    await expect(loadPolicy("complaint")).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" });
  });
  it("fails a missing explicitly captured version without replacement", async () => {
    mocks.readFile.mockRejectedValue(new Error("missing"));
    await expect(loadPolicy("complaint", complaintDigest)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });
  it.each(["tampered", "", "summary without tables and footnotes"])("blocks a mismatched or incomplete snapshot: %s", async (content) => {
    mocks.readFile.mockResolvedValue(Buffer.from(content)); mocks.digest.mockReturnValue("0".repeat(64));
    await expect(loadPolicy("complaint")).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" });
    await expect(loadPolicy("complaint", complaintDigest)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
  });
  it("resolves only selected official references and rejects invented/cross-policy anchors", async () => {
    const policy = await loadPolicy("complaint");
    const id = "przebieg-reklamacji";
    expect(resolvePolicyReferences(policy, [id, id])).toEqual([policy.headings.find((heading) => heading.headingId === id)]);
    expect(resolvePolicyReferences(policy, [])).toEqual([]);
    expect(() => resolvePolicyReferences(policy, ["anulowanie-zakupu"])).toThrow();
    expect(() => resolvePolicyReferences(policy, ["invented"])).toThrow();
  });
});
