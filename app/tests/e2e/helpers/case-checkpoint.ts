import type { Page } from "@playwright/test";
import { ACTIVE_CASE_STORAGE_KEY, activeCaseSnapshotSchema, localCaseRegistrySchema, type ActiveCaseSnapshot, type LocalCaseRegistry } from "../../../src/lib/contracts/session";

type CheckpointResult = { success: true; data: ActiveCaseSnapshot } | { success: false };

/** Parse real browser persistence only. Never fabricate or write a checkpoint. */
export function parseCaseCheckpoint(raw: string | null, caseId?: string): CheckpointResult {
  if (raw === null) return { success: false };
  try {
    const value: unknown = JSON.parse(raw);
    const registry = localCaseRegistrySchema.safeParse(value);
    if (registry.success) {
      const snapshot = registry.data.cases[caseId ?? registry.data.activeCaseId];
      return snapshot ? { success: true, data: snapshot } : { success: false };
    }
    const legacy = activeCaseSnapshotSchema.safeParse(value);
    return legacy.success && (caseId === undefined || legacy.data.caseId === caseId)
      ? { success: true, data: legacy.data } : { success: false };
  } catch { return { success: false }; }
}

export async function readCaseCheckpoint(page: Page, caseId?: string): Promise<ActiveCaseSnapshot> {
  const parsed = parseCaseCheckpoint(await page.evaluate(key => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY), caseId);
  if (!parsed.success) throw new Error("Actual saved case checkpoint is missing or invalid");
  return parsed.data;
}

export async function readCaseRegistry(page: Page): Promise<LocalCaseRegistry> {
  const raw = await page.evaluate(key => localStorage.getItem(key), ACTIVE_CASE_STORAGE_KEY);
  try {
    const parsed = localCaseRegistrySchema.safeParse(raw === null ? null : JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch { /* Do not expose private persistence in diagnostics. */ }
  throw new Error("Actual local case registry is missing or invalid");
}
