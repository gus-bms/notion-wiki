import { z } from "zod";
import { citationSchema } from "./citation";

export const createSourceSchema = z.object({
  name: z.string().min(1),
  notionIntegrationToken: z.string().min(1),
  notionApiVersion: z.string().min(1).default("2025-09-03")
});

export const createTargetSchema = z.object({
  targetType: z.enum(["data_source", "page"]),
  targetId: z.string().min(1)
});

export const runIngestSchema = z.object({
  sourceId: z.number().int().positive(),
  mode: z.enum(["full", "incremental"])
});

export const ingestPageFailureStatusSchema = z.enum(["open", "retry_queued", "resolved"]);

export const listIngestPageFailuresQuerySchema = z.object({
  sourceId: z.number().int().positive(),
  includeResolved: z.boolean().default(false)
});

export const ingestPageFailureSchema = z.object({
  failureId: z.number().int().positive(),
  sourceId: z.number().int().positive(),
  notionPageId: z.string().min(1),
  status: ingestPageFailureStatusSchema,
  failureCount: z.number().int().nonnegative(),
  targetType: z.string().nullable(),
  targetIdValue: z.string().nullable(),
  failureStage: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string(),
  firstFailedAt: z.string(),
  lastFailedAt: z.string(),
  retryRequestedAt: z.string().nullable(),
  retryRequestedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedIngestJobId: z.number().int().positive().nullable()
});

export const listIngestPageFailuresResponseSchema = z.object({
  failures: z.array(ingestPageFailureSchema)
});

export const chatRequestSchema = z.object({
  sourceId: z.number().int().positive(),
  sessionId: z.number().int().positive().optional(),
  message: z.string().min(1)
});

export const chatResponseSchema = z.object({
  sessionId: z.number().int().positive(),
  answer: z.string().min(1),
  citations: z.array(citationSchema),
  meta: z.object({
    topK: z.number().int().positive(),
    retrievalMs: z.number().nonnegative(),
    llmMs: z.number().nonnegative()
  })
});

export const feedbackSchema = z.object({
  messageId: z.number().int().positive(),
  score: z.union([z.literal(-1), z.literal(1)]),
  reason: z.string().min(1).max(300)
});

export const workspaceLoginSchema = z.object({
  name: z.string().min(1).default("my-notion"),
  notionIntegrationToken: z.string().min(1),
  notionApiVersion: z.string().min(1).default("2025-09-03"),
  autoDiscoverTargets: z.boolean().default(true),
  autoRunFullSync: z.boolean().default(true)
});

export const workspaceBootstrapSchema = z.object({
  hasSource: z.boolean(),
  source: z
    .object({
      sourceId: z.number().int().positive(),
      name: z.string(),
      notionApiVersion: z.string(),
      status: z.enum(["active", "inactive"]),
      activeTargetCount: z.number().int().nonnegative(),
      documentCount: z.number().int().nonnegative()
    })
    .nullable(),
  latestIngestJob: z
    .object({
      jobId: z.number().int().positive(),
      status: z.enum(["queued", "running", "succeeded", "failed"]),
      mode: z.enum(["full", "incremental", "webhook"]),
      startedAt: z.string().nullable(),
      finishedAt: z.string().nullable()
    })
    .nullable()
});

export const workspaceLoginResponseSchema = z.object({
  sourceId: z.number().int().positive(),
  mode: z.enum(["created", "updated"]),
  activeTargetCount: z.number().int().nonnegative(),
  discovery: z
    .object({
      scannedEntries: z.number().int().nonnegative(),
      discoveredTargets: z.number().int().nonnegative(),
      createdTargets: z.number().int().nonnegative(),
      reactivatedTargets: z.number().int().nonnegative(),
      dataSourceTargets: z.number().int().nonnegative(),
      pageTargets: z.number().int().nonnegative()
    })
    .nullable(),
  fullSyncJob: z
    .object({
      jobId: z.number().int().positive(),
      queued: z.literal(true)
    })
    .nullable()
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type RunIngestInput = z.infer<typeof runIngestSchema>;
export type IngestPageFailureStatus = z.infer<typeof ingestPageFailureStatusSchema>;
export type ListIngestPageFailuresQuery = z.infer<typeof listIngestPageFailuresQuerySchema>;
export type IngestPageFailureOutput = z.infer<typeof ingestPageFailureSchema>;
export type ListIngestPageFailuresOutput = z.infer<typeof listIngestPageFailuresResponseSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type ChatResponseOutput = z.infer<typeof chatResponseSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type WorkspaceLoginInput = z.infer<typeof workspaceLoginSchema>;
export type WorkspaceBootstrapOutput = z.infer<typeof workspaceBootstrapSchema>;
export type WorkspaceLoginResponseOutput = z.infer<typeof workspaceLoginResponseSchema>;
