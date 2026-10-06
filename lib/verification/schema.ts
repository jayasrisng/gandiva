import { z } from "zod";
export const attributeResultSchema = z.object({
  factId: z.string(),
  status: z.enum(["PASS", "WARNING", "FAIL", "NOT VERIFIABLE"]),
  explanation: z.string(),
  sourceAssetIds: z.array(z.string()),
  originalRegion: z.string().nullable(),
  generatedRegion: z.string().nullable(),
});
export const verificationSchema = z.object({
  schemaVersion: z.literal(1),
  summary: z.string(),
  attributes: z.array(attributeResultSchema),
});
export type VerificationReport = z.infer<typeof verificationSchema>;
