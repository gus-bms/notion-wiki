export type Citation = { chunkId: string; title: string; url: string; quote: string };

export type { ChatSessionListOutput, ChatSessionDetailOutput } from "@notion-wiki/contracts";

export type ChatDocument = { documentId: number; title: string; url: string; lastEditedAt?: string | null };

export type ChatResult = {
  sessionId: number;
  answer: string;
  citations: Citation[];
  documents: ChatDocument[];
  meta: { topK: number; retrievalMs: number; llmMs: number };
};

export type ChatThreadItem = {
  localId: string | number;
  question: string;
  result: ChatResult;
  askedAtIso: string;
};

export type SelectedCitation = {
  citation: Citation;
  fromQuestion: string;
  fromAskedAtIso: string;
  sourceThreadLocalId: number;
  sourceCitationIndex: number;
};

export type WorkspaceBootstrap = {
  hasSource: boolean;
  source: {
    sourceId: number;
    name: string;
    notionApiVersion: string;
    status: "active" | "inactive";
    activeTargetCount: number;
    documentCount: number;
  } | null;
  latestIngestJob: {
    jobId: number;
    status: "queued" | "running" | "succeeded" | "failed";
    mode: "full" | "incremental" | "webhook";
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
};

export type WorkspaceLoginResponse = {
  sourceId: number;
  mode: "created" | "updated";
  activeTargetCount: number;
  discovery: {
    scannedEntries: number;
    discoveredTargets: number;
    createdTargets: number;
    reactivatedTargets: number;
    dataSourceTargets: number;
    pageTargets: number;
  } | null;
  fullSyncJob: {
    jobId: number;
    queued: true;
  } | null;
};

export type IngestPageFailure = {
  failureId: number;
  sourceId: number;
  notionPageId: string;
  status: "open" | "retry_queued" | "resolved";
  failureCount: number;
  targetType: string | null;
  targetIdValue: string | null;
  failureStage: string;
  errorCode: string | null;
  errorMessage: string;
  firstFailedAt: string;
  lastFailedAt: string;
  retryRequestedAt: string | null;
  retryRequestedBy: string | null;
  resolvedAt: string | null;
  resolvedIngestJobId: number | null;
};
