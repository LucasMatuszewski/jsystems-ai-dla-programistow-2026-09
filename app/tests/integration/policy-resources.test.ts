import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { policyMetadataSchema } from "../../src/lib/contracts/policy";
import { getPolicyRegistration, type PolicyScenario } from "../../src/server/policies/registry";
import { loadPolicy, resolvePolicyReferences } from "../../src/server/policies/policy-loader";

const sources = resolve(process.cwd(), "../assets/policy-sources");
describe("complete private official snapshots with real filesystem", { concurrent: false }, () => {
  it.each(["complaint", "return"] as const)("loads %s byte-for-byte with trusted provenance and every anchored heading", async (scenario) => {
    const manifest = JSON.parse(await readFile(resolve(sources, "manifest.json"), "utf8"));
    const sourceFile = scenario === "complaint" ? "allegro-complaints.html" : "allegro-returns.html";
    const original = await readFile(resolve(sources, sourceFile));
    const expected = manifest.files.find((file: { file: string }) => file.file === sourceFile);
    const policy = await loadPolicy(scenario);
    const registration = policy.provenance;
    const copy = await readFile(resolve("resources/policies", registration.fileName));
    expect(copy.equals(original)).toBe(true);
    expect(createHash("sha256").update(copy).digest("hex")).toBe(expected.sha256);
    expect(policy.html).toBe(original.toString("utf8"));
    // Git checkout uses CRLF; preserve bytes, compare manifest's LF character count.
    expect(policy.html.replace(/\r\n/g, "\n").length).toBe(expected.characters);
    expect(policy.html).toContain("<table>");
    expect(policy.html).toContain("<a href=");
    expect(registration.originalRetrievedAt).toBe(manifest.retrieved_at_utc);
    expect(registration.language).toBe(manifest.source_language);
    expect(policyMetadataSchema.safeParse({ version: registration.version, digest: registration.digest,
      sourceUrl: registration.sourceUrl, retrievedAt: registration.retrievedAt, references: [] }).success).toBe(true);
    const anchored = [...policy.html.matchAll(/<h[1-6] id="([^"]+)">([^<]+)<\/h[1-6]>/g)];
    expect(policy.headings).toEqual(anchored.map((match) => ({ headingId: match[1], title: match[2], url: `${manifest.source_url}#${match[1]}` })));
    expect(policy.headings.length).toBe(scenario === "complaint" ? 4 : 17);
    expect(resolvePolicyReferences(policy, [policy.headings[0].headingId])).toEqual([policy.headings[0]]);
    expect(await loadPolicy(scenario, registration.version)).toEqual(policy);
  });
  it("does not combine other scenario content", async () => {
    expect((await loadPolicy("complaint")).html).not.toContain('id="anulowanie-zakupu"');
    expect((await loadPolicy("return")).html).not.toContain('id="przebieg-reklamacji"');
  });
  it("real missing snapshot gives operational errors and restores it", async () => {
    const registration = getPolicyRegistration("complaint");
    const path = resolve("resources/policies", registration.fileName);
    const held = `${path}.test-held`;
    await rename(path, held);
    try {
      await expect(loadPolicy("complaint")).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" });
      await expect(loadPolicy("complaint", registration.version)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
    } finally { await rename(held, path); }
  });
  it("real truncated HTML is refused and restored", async () => {
    const registration = getPolicyRegistration("return");
    const path = resolve("resources/policies", registration.fileName);
    const original = await readFile(path);
    await writeFile(path, original.subarray(0, 600));
    try { await expect(loadPolicy("return")).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" }); }
    finally { await writeFile(path, original); }
  });
  it("never accepts arbitrary paths or another scenario version", async () => {
    await expect(loadPolicy("unknown" as PolicyScenario)).rejects.toMatchObject({ code: "POLICY_CONFIGURATION_ERROR" });
    await expect(loadPolicy("complaint", getPolicyRegistration("return").version)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
  });
});
