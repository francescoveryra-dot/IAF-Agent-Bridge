import { z } from "zod";

export const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const MAX_PROMPT = 100_000;
export const MAX_RESULT_BYTES = 600_000;

export const projectIdSchema = z.string().trim().regex(PROJECT_ID, "projectId must be a local allowlist name, not a filesystem path.");

const modeSchema = z.enum(["agent", "plan", "ask"]);

export const delegateRequestSchema = z.object({
  projectId: projectIdSchema,
  prompt: z.string().trim().min(1).max(MAX_PROMPT),
  sessionId: z.string().trim().min(1).max(200).optional(),
  mode: modeSchema.default("agent"),
  model: z.string().trim().min(1).max(200).optional(),
  fast: z.boolean().default(false),
  clientRequestId: z.string().trim().min(8).max(200).optional(),
}).strict();

export const doctorRequestSchema = z.object({
  projectId: projectIdSchema.optional(),
  deep: z.boolean().default(false),
  clientRequestId: z.string().trim().min(8).max(200).optional(),
}).strict();

export const cancelRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  clientRequestId: z.string().trim().min(8).max(200).optional(),
}).strict();

export type DelegateRequest = z.infer<typeof delegateRequestSchema>;
export type DoctorRequest = z.infer<typeof doctorRequestSchema>;
export type CancelRequest = z.infer<typeof cancelRequestSchema>;
