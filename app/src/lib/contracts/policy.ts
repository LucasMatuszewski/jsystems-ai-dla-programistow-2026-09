import { z } from "zod";
import { sha256Schema } from "./image";

export const POLICY_CONTRACT_REVISION = 1 as const;
const text = z.string().trim().min(1);
const publicUrl = z.url({ protocol: /^https?$/ });
// Only trusted server registry resolution establishes the official title/URL/provenance.
export const policyReferenceSchema = z.strictObject({ headingId: text, title: text, url: publicUrl });
export const policyMetadataSchema = z.strictObject({
  version: text, digest: sha256Schema, sourceUrl: publicUrl, retrievedAt: z.iso.datetime(),
  references: z.array(policyReferenceSchema),
});
export type PolicyReference = z.infer<typeof policyReferenceSchema>;
export type PolicyMetadata = z.infer<typeof policyMetadataSchema>;
