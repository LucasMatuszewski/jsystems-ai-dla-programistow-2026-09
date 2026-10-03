import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedPolicy } from "@/server/policies/policy-loader";
import { validateDecisionReferences } from "@/server/policies/validate-references";
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/policies/policy-loader", () => ({ resolvePolicyReferences: mocks.resolve }));
vi.mock("@/server/http/errors", () => ({ OperationError: class extends Error { constructor(public code: string) { super(code); } } }));
const headings = [{ headingId: "complaint-a", title: "Reklamacja A", url: "https://example.test/policy#complaint-a" }, { headingId: "complaint-b", title: "Reklamacja B", url: "https://example.test/policy#complaint-b" }];
const policy = { scenario: "complaint", headings } as unknown as LoadedPolicy;
beforeEach(() => { mocks.resolve.mockImplementation((_policy, ids: string[]) => [...new Set(ids)].map(id => headings.find(heading => heading.headingId === id))); });
describe("server-resolved used decision references", () => {
  it("returns only official used references with deduplication and trusted labels/URLs", () => {
    expect(validateDecisionReferences(policy, ["complaint-b", "complaint-a", "complaint-b"])).toEqual([headings[1], headings[0]]);
    expect(mocks.resolve).toHaveBeenCalledWith(policy, ["complaint-b", "complaint-a"]);
  });
  it.each([[], ["missing"], ["return-a"], ["complaint-a", "missing"]].map(ids => ({ ids })))("rejects missing/unknown/other-scenario generated references before resolution: $ids", ({ ids }) => {
    expect(() => validateDecisionReferences(policy, ids)).toThrowError(expect.objectContaining({ code: "INVALID_AI_OUTPUT" }));
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("propagates a real trusted resolver/resource failure instead of substituting invented references", () => {
    const failure = new Error("POLICY_CONFIGURATION_ERROR"); mocks.resolve.mockImplementation(() => { throw failure; });
    expect(() => validateDecisionReferences(policy, ["complaint-a"])).toThrow(failure);
  });
});
