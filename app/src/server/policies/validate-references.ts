import "server-only";
import type { PolicyReference } from "@/lib/contracts/policy";
import { resolvePolicyReferences, type LoadedPolicy } from "./policy-loader";
import { OperationError } from "@/server/http/errors";
export function validateDecisionReferences(policy: LoadedPolicy, ids: readonly string[]): PolicyReference[] {
  if (ids.length === 0 || ids.some(id => !policy.headings.some(heading => heading.headingId === id))) throw new OperationError("INVALID_AI_OUTPUT");
  return resolvePolicyReferences(policy, [...new Set(ids)]);
}
