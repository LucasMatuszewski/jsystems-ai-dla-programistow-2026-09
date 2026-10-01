import "server-only";
import { createHash } from "node:crypto";
import type { CaseFormInput } from "@/lib/contracts/form";
import { storedCaseFormSchema } from "@/lib/contracts/requests";
export function createFormFingerprint(form: CaseFormInput): string {
  const value = storedCaseFormSchema.parse(form);
  const canonical = { scenario: value.scenario, category: value.category, equipmentName: value.equipmentName,
    purchaseDate: value.purchaseDate, deliveryDate: value.deliveryDate, buyerStatus: value.buyerStatus,
    sellerStatus: value.sellerStatus, reason: value.reason, requestedRemedy: value.requestedRemedy };
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}
