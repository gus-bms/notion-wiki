export type IngestMode = "full" | "incremental";

export interface IngestRunJobPayload {
  sourceId: number;
  mode: IngestMode;
  requestedBy: string;
  requestedAt: string;
  ingestJobId: number;
  pageIds?: string[];
  retryFailureId?: number;
}

export interface IngestPageJobPayload {
  sourceId: number;
  notionPageId: string;
  targetType: "data_source" | "page";
  targetId: string;
  ingestJobId: number;
}

export interface IngestWebhookPayload {
  sourceId: number;
  entityId: string;
  eventType: string;
  receivedAt: string;
}

export const QUEUE_NAMES = {
  ingest: "ingest",
  deadletter: "ingest.deadletter"
} as const;

export const JOB_NAMES = {
  ingestFull: "ingest.full",
  ingestIncremental: "ingest.incremental",
  ingestPage: "ingest.page",
  ingestWebhook: "ingest.webhook",
  ingestDeadletter: "ingest.retry.deadletter"
} as const;
