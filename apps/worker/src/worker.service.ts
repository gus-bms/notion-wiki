import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { createHash } from "crypto";
import IORedis from "ioredis";
import { IngestRunJobPayload, JOB_NAMES, QUEUE_NAMES } from "@notion-wiki/contracts";
import { decryptSecret, prisma } from "@notion-wiki/db";
import { GeminiProvider, MockProvider, ProviderError } from "@notion-wiki/llm-provider";
import { NotionClient, NotionClientError } from "@notion-wiki/notion-client";
import { log } from "@notion-wiki/observability";
import { buildChunkId, chunkTextByTokenLength, normalizeBlocksToText } from "@notion-wiki/retrieval";
import { QdrantClient, QdrantPoint } from "@notion-wiki/vector-store";

interface NotionPageLike {
  id?: string;
  url?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  archived?: boolean;
  properties?: Record<string, unknown>;
}

interface IngestTargetContext {
  targetType: "data_source" | "page";
  targetIdValue: string;
}

class PageProcessingError extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "PageProcessingError";
  }
}

@Injectable()
export class IngestWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null
  });
  private readonly queue = new Queue(QUEUE_NAMES.ingest, { connection: this.redis });
  private worker!: Worker;
  private readonly qdrant = new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION ?? "notion_chunks"
  });
  private readonly llmProvider = process.env.GEMINI_API_KEY
    ? new GeminiProvider(process.env.GEMINI_API_KEY)
    : new MockProvider();

  private collectionInitialized = false;

  async getHealthStatus(): Promise<{
    ok: boolean;
    workerInitialized: boolean;
    queueName: string;
    now: string;
  }> {
    return {
      ok: true,
      workerInitialized: Boolean(this.worker),
      queueName: QUEUE_NAMES.ingest,
      now: new Date().toISOString()
    };
  }

  async getQueuePingStatus(): Promise<{
    ok: boolean;
    queueName: string;
    redisPing: string;
    counts: Record<string, number>;
    now: string;
  }> {
    try {
      const [redisPing, counts] = await Promise.all([
        this.redis.ping(),
        this.queue.getJobCounts("waiting", "active", "completed", "failed", "delayed")
      ]);

      return {
        ok: redisPing.toUpperCase() === "PONG",
        queueName: QUEUE_NAMES.ingest,
        redisPing,
        counts,
        now: new Date().toISOString()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "queue ping failed";
      log("error", "queue.ping.failed", { message });
      return {
        ok: false,
        queueName: QUEUE_NAMES.ingest,
        redisPing: "ERROR",
        counts: {},
        now: new Date().toISOString()
      };
    }
  }

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      QUEUE_NAMES.ingest,
      async (job) => {
        switch (job.name) {
          case JOB_NAMES.ingestFull:
          case JOB_NAMES.ingestIncremental:
            await this.processIngestRunJob(job as Job<IngestRunJobPayload>);
            break;
          case JOB_NAMES.ingestDeadletter:
            log("warn", "ingest.deadletter.received", { jobId: job.id });
            break;
          default:
            log("warn", "ingest.job.unknown", { name: job.name, jobId: job.id });
        }
      },
      {
        connection: this.redis,
        concurrency: 1
      }
    );

    this.worker.on("completed", (job) => {
      log("info", "ingest.job.completed", { jobId: job.id, name: job.name });
    });
    this.worker.on("failed", (job, error) => {
      log("error", "ingest.job.failed", { jobId: job?.id, name: job?.name, message: error.message });
    });

    log("info", "worker.started", { queue: QUEUE_NAMES.ingest });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.redis.quit();
  }

  private async processIngestRunJob(job: Job<IngestRunJobPayload>): Promise<void> {
    const startedAt = new Date();
    await prisma.ingestJob.update({
      where: { id: job.data.ingestJobId },
      data: { status: "running", startedAt, attempt: { increment: 1 } }
    });

    try {
      const source = await prisma.source.findUnique({
        where: { id: job.data.sourceId },
        include: { syncTargets: true }
      });
      if (!source) {
        throw new Error(`Source not found: ${job.data.sourceId}`);
      }

      const notionClient = new NotionClient({
        token: decryptSecret(source.notionTokenEnc),
        notionVersion: source.notionApiVersion,
        requestsPerSecond: Number(process.env.NOTION_REQUESTS_PER_SECOND ?? 3)
      });

      const requestedPageIds = Array.from(new Set((job.data.pageIds ?? []).filter((pageId) => pageId.trim().length > 0)));
      let pageFailureCount = 0;

      if (requestedPageIds.length > 0) {
        for (const notionPageId of requestedPageIds) {
          try {
            await this.processSinglePage(source.id, notionClient, notionPageId, job.data.ingestJobId);
          } catch (error) {
            pageFailureCount += 1;
            const normalized = await this.recordPageFailure({
              sourceId: source.id,
              notionPageId,
              ingestJobId: job.data.ingestJobId,
              error
            });

            log("warn", "ingest.page.failed", {
              ingestJobId: job.data.ingestJobId,
              sourceId: source.id,
              notionPageId,
              targetId: notionPageId,
              failureStage: normalized.failureStage,
              errorCode: normalized.errorCode,
              message: normalized.errorMessage
            });
          }
        }

        await this.completeIngestJob(job.data.ingestJobId, pageFailureCount);
        return;
      }

      const activeTargets = source.syncTargets.filter((target) => target.status === "active");
      const processedPageIds = new Set<string>();
      for (const target of activeTargets) {
        if (target.targetType === "data_source") {
          const pages = await notionClient.listAllDataSourcePages(target.targetIdValue);
          for (const page of pages) {
            if (job.data.mode === "incremental" && target.lastSyncAt) {
              const editedAt = page.last_edited_time ? new Date(page.last_edited_time) : undefined;
              if (editedAt && editedAt <= target.lastSyncAt) {
                continue;
              }
            }

            if (processedPageIds.has(page.id)) {
              continue;
            }

            try {
              await this.processSinglePage(source.id, notionClient, page.id, job.data.ingestJobId, {
                pageUrl: page.url,
                lastEditedTime: page.last_edited_time,
                inTrash: page.in_trash ?? page.archived ?? false
              });
              processedPageIds.add(page.id);
            } catch (error) {
              pageFailureCount += 1;
              const normalized = await this.recordPageFailure({
                sourceId: source.id,
                notionPageId: page.id,
                ingestJobId: job.data.ingestJobId,
                target: {
                  targetType: "data_source",
                  targetIdValue: target.targetIdValue
                },
                error
              });

              log("warn", "ingest.page.failed", {
                ingestJobId: job.data.ingestJobId,
                sourceId: source.id,
                notionPageId: page.id,
                targetId: target.targetIdValue,
                failureStage: normalized.failureStage,
                errorCode: normalized.errorCode,
                message: normalized.errorMessage
              });
            }
          }
        } else if (target.targetType === "page") {
          if (processedPageIds.has(target.targetIdValue)) {
            continue;
          }
          try {
            await this.processSinglePage(source.id, notionClient, target.targetIdValue, job.data.ingestJobId);
            processedPageIds.add(target.targetIdValue);
          } catch (error) {
            pageFailureCount += 1;
            const normalized = await this.recordPageFailure({
              sourceId: source.id,
              notionPageId: target.targetIdValue,
              ingestJobId: job.data.ingestJobId,
              target: {
                targetType: "page",
                targetIdValue: target.targetIdValue
              },
              error
            });

            log("warn", "ingest.page.failed", {
              ingestJobId: job.data.ingestJobId,
              sourceId: source.id,
              notionPageId: target.targetIdValue,
              targetId: target.targetIdValue,
              failureStage: normalized.failureStage,
              errorCode: normalized.errorCode,
              message: normalized.errorMessage
            });
          }
        }

        await prisma.syncTarget.update({
          where: { id: target.id },
          data: { lastSyncAt: new Date() }
        });
      }

      await this.completeIngestJob(job.data.ingestJobId, pageFailureCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingest failure";
      await prisma.ingestJob.update({
        where: { id: job.data.ingestJobId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorCode: "INGEST_FAILED",
          errorMessage: message
        }
      });
      throw error;
    }
  }

  private async processSinglePage(
    sourceId: number,
    notionClient: NotionClient,
    notionPageId: string,
    ingestJobId: number,
    hint?: { pageUrl?: string; lastEditedTime?: string; inTrash?: boolean }
  ): Promise<void> {
    let stage = "retrieve_page";

    try {
      const page = (await notionClient.retrievePage(notionPageId)) as NotionPageLike;
      const isDeleted = hint?.inTrash ?? page.in_trash ?? page.archived ?? false;
      const title = this.extractTitle(page);
      const url = hint?.pageUrl ?? page.url ?? "";
      const lastEditedAt = hint?.lastEditedTime ?? page.last_edited_time;

      stage = "retrieve_blocks";
      const blocks = await notionClient.listAllBlocksRecursive(notionPageId);

      stage = "normalize_blocks";
      const rawText = normalizeBlocksToText(blocks);
      const rawTextHash = createHash("sha256").update(rawText).digest("hex");

      stage = "document_upsert";
      const document = await prisma.document.upsert({
        where: {
          sourceId_notionPageId: {
            sourceId,
            notionPageId
          }
        },
        update: {
          title,
          url,
          lastEditedAt: lastEditedAt ? new Date(lastEditedAt) : null,
          status: isDeleted ? "deleted" : "active",
          rawText,
          rawTextHash,
          indexedAt: new Date()
        },
        create: {
          sourceId,
          notionPageId,
          title,
          url,
          lastEditedAt: lastEditedAt ? new Date(lastEditedAt) : null,
          status: isDeleted ? "deleted" : "active",
          rawText,
          rawTextHash,
          indexedAt: new Date()
        }
      });

      if (isDeleted) {
        stage = "vector_mark_deleted";
        await this.qdrant.markDocumentDeleted(document.id);
        await this.markPageFailureResolved(sourceId, notionPageId, ingestJobId);
        return;
      }

      stage = "chunking";
      const chunks = chunkTextByTokenLength(rawText, {
        targetTokens: 800,
        overlapTokens: 120
      });
      if (chunks.length === 0) {
        await this.markPageFailureResolved(sourceId, notionPageId, ingestJobId);
        return;
      }

      stage = "embedding";
      const embedResponse = await this.llmProvider.embed({
        texts: chunks.map((chunk) => chunk.chunkText),
        model: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
        taskType: "retrieval_document"
      });

      stage = "vector_collection_bootstrap";
      if (!this.collectionInitialized) {
        await this.qdrant.ensureCollection(embedResponse.dimensions);
        await this.qdrant.ensurePayloadIndexes();
        this.collectionInitialized = true;
      }

      const points: QdrantPoint[] = [];
      const currentChunkIds: string[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const chunkId = buildChunkId({
          sourceId,
          notionPageId,
          chunkIndex: chunk.chunkIndex,
          contentHash: chunk.contentHash
        });
        const qdrantPointId = this.toQdrantPointId(chunkId);
        currentChunkIds.push(chunkId);

        stage = "chunk_upsert";
        await prisma.documentChunk.upsert({
          where: { chunkId },
          update: {
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.chunkText,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            tokenCount: chunk.tokenCount,
            contentHash: chunk.contentHash
          },
          create: {
            documentId: document.id,
            chunkId,
            chunkIndex: chunk.chunkIndex,
            chunkText: chunk.chunkText,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            tokenCount: chunk.tokenCount,
            contentHash: chunk.contentHash
          }
        });

        stage = "embedding_ref_upsert";
        await prisma.embeddingRef.upsert({
          where: { chunkId },
          update: {
            provider: embedResponse.provider,
            model: embedResponse.model,
            vectorDim: embedResponse.dimensions,
            qdrantPointId
          },
          create: {
            chunkId,
            provider: embedResponse.provider,
            model: embedResponse.model,
            vectorDim: embedResponse.dimensions,
            qdrantPointId
          }
        });

        points.push({
          id: qdrantPointId,
          vector: embedResponse.vectors[index] ?? [],
          payload: {
            chunkId,
            sourceId,
            documentId: document.id,
            notionPageId,
            chunkIndex: chunk.chunkIndex,
            title,
            url,
            text: chunk.chunkText,
            lastEditedAt: lastEditedAt,
            status: "active"
          }
        });
      }

      stage = "vector_upsert";
      await this.qdrant.upsert(points);

      if (currentChunkIds.length > 0) {
        stage = "chunk_cleanup";
        const staleChunks = await prisma.documentChunk.findMany({
          where: {
            documentId: document.id,
            chunkId: { notIn: currentChunkIds }
          },
          select: {
            embeddingRef: {
              select: {
                qdrantPointId: true
              }
            }
          }
        });

        const stalePointIds = staleChunks
          .map((chunk) => chunk.embeddingRef?.qdrantPointId)
          .filter((pointId): pointId is string => Boolean(pointId));

        if (stalePointIds.length > 0) {
          stage = "vector_cleanup";
          await this.qdrant.deletePoints(stalePointIds);
        }

        stage = "chunk_cleanup";
        await prisma.documentChunk.deleteMany({
          where: {
            documentId: document.id,
            chunkId: { notIn: currentChunkIds }
          }
        });
      }

      await this.markPageFailureResolved(sourceId, notionPageId, ingestJobId);
    } catch (error) {
      throw this.toPageProcessingError(error, stage);
    }
  }

  private async completeIngestJob(ingestJobId: number, pageFailureCount: number): Promise<void> {
    await prisma.ingestJob.update({
      where: { id: ingestJobId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        errorCode: pageFailureCount > 0 ? "INGEST_PARTIAL_FAILURE" : null,
        errorMessage:
          pageFailureCount > 0
            ? `Skipped ${pageFailureCount} page(s) due to recoverable errors. Check worker logs for details.`
            : null
      }
    });
  }

  private async markPageFailureResolved(sourceId: number, notionPageId: string, ingestJobId: number): Promise<void> {
    await prisma.ingestPageFailure.updateMany({
      where: {
        sourceId,
        notionPageId,
        status: {
          in: ["open", "retry_queued"]
        }
      },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedIngestJobId: ingestJobId
      }
    });
  }

  private async recordPageFailure(params: {
    sourceId: number;
    notionPageId: string;
    ingestJobId: number;
    target?: IngestTargetContext;
    error: unknown;
  }): Promise<{ failureStage: string; errorCode: string | null; errorMessage: string }> {
    const normalized = this.normalizePageFailure(params.error);
    const now = new Date();

    await prisma.ingestPageFailure.upsert({
      where: {
        sourceId_notionPageId: {
          sourceId: params.sourceId,
          notionPageId: params.notionPageId
        }
      },
      update: {
        status: "open",
        failureCount: {
          increment: 1
        },
        latestIngestJobId: params.ingestJobId,
        targetType: params.target?.targetType ?? null,
        targetIdValue: params.target?.targetIdValue ?? null,
        failureStage: normalized.failureStage,
        errorCode: normalized.errorCode,
        errorMessage: normalized.errorMessage,
        lastFailedAt: now,
        retryIngestJobId: null,
        retryRequestedAt: null,
        retryRequestedBy: null,
        resolvedAt: null,
        resolvedIngestJobId: null
      },
      create: {
        sourceId: params.sourceId,
        notionPageId: params.notionPageId,
        status: "open",
        failureCount: 1,
        latestIngestJobId: params.ingestJobId,
        targetType: params.target?.targetType ?? null,
        targetIdValue: params.target?.targetIdValue ?? null,
        failureStage: normalized.failureStage,
        errorCode: normalized.errorCode,
        errorMessage: normalized.errorMessage,
        firstFailedAt: now,
        lastFailedAt: now
      }
    });

    return normalized;
  }

  private normalizePageFailure(error: unknown): { failureStage: string; errorCode: string | null; errorMessage: string } {
    const wrapped = error instanceof PageProcessingError ? error : this.toPageProcessingError(error, "unknown");
    const rootCause = wrapped.cause;

    if (rootCause instanceof NotionClientError) {
      return {
        failureStage: wrapped.stage,
        errorCode: `NOTION_${rootCause.code}`,
        errorMessage: rootCause.message
      };
    }

    if (rootCause instanceof ProviderError) {
      return {
        failureStage: wrapped.stage,
        errorCode: `EMBEDDING_${rootCause.code}`,
        errorMessage: rootCause.message
      };
    }

    if (rootCause instanceof Error && rootCause.message.includes("Qdrant request failed")) {
      return {
        failureStage: wrapped.stage,
        errorCode: "QDRANT_REQUEST_FAILED",
        errorMessage: rootCause.message
      };
    }

    return {
      failureStage: wrapped.stage,
      errorCode: null,
      errorMessage: wrapped.message
    };
  }

  private toPageProcessingError(error: unknown, stage: string): PageProcessingError {
    if (error instanceof PageProcessingError) {
      return error;
    }
    const message = error instanceof Error ? error.message : "page processing failed";
    return new PageProcessingError(stage, message, error);
  }

  private extractTitle(page: NotionPageLike): string {
    const properties = page.properties ?? {};
    for (const value of Object.values(properties)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const typed = value as { type?: string; title?: Array<{ plain_text?: string }> };
      if (typed.type === "title" && Array.isArray(typed.title)) {
        const title = typed.title.map((item) => item.plain_text ?? "").join("").trim();
        if (title) {
          return title;
        }
      }
    }
    return "Untitled";
  }

  private toQdrantPointId(chunkId: string): string {
    const hex = createHash("sha256").update(chunkId).digest("hex").slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}
