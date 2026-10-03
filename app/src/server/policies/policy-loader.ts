import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PolicyReference } from "../../lib/contracts/policy";
import { getPolicyRegistration, PolicyResourceError, type PolicyRegistration, type PolicyScenario } from "./registry";

export interface LoadedPolicy {
  readonly scenario: PolicyScenario;
  readonly html: string;
  readonly provenance: PolicyRegistration;
  readonly headings: readonly PolicyReference[];
}
export async function loadPolicy(scenario: PolicyScenario, version?: string): Promise<LoadedPolicy> {
  const provenance = getPolicyRegistration(scenario, version);
  // No client-provided path, network fetch, fallback version or cached success.
  // Revalidate the immutable bytes on every use, including restored sessions.
  try {
    const bytes = await readFile(resolve(process.cwd(), "resources/policies", provenance.fileName));
    if (createHash("sha256").update(bytes).digest("hex") !== provenance.digest) {
      throw new Error("Policy digest mismatch");
    }
    return Object.freeze({ scenario, html: bytes.toString("utf8"), provenance, headings: provenance.headings });
  } catch {
    throw new PolicyResourceError(version === undefined ? "POLICY_CONFIGURATION_ERROR" : "POLICY_VERSION_UNAVAILABLE");
  }
}
export function resolvePolicyReferences(policy: LoadedPolicy, ids: readonly string[]): PolicyReference[] {
  const trusted = getPolicyRegistration(policy.scenario, policy.provenance.version).headings;
  return [...new Set(ids)].map((id) => {
    const reference = trusted.find((heading) => heading.headingId === id);
    if (!reference) throw new PolicyResourceError("POLICY_CONFIGURATION_ERROR");
    return reference;
  });
}
