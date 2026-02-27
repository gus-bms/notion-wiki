import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  listIngestPageFailuresResponseSchema,
  listIngestPageFailuresQuerySchema,
  runIngestSchema
} from "@notion-wiki/contracts";
import { prisma } from "@notion-wiki/db";
import { IngestQueueService } from "./ingest.queue.service";
import { SourcesService } from "./sources.service";
import { TargetsService } from "./targets.service";

@Injectable()
export class IngestService {
  constructor(
    private readonly queueService: IngestQueueService,
    private readonly sourcesService: SourcesService,
    private readonly targetsService: TargetsService
  ) {}

  async runIngest(input: unknown, requestedBy: string): Promise<{ jobId: number; queued: true }> {
    const parsed = runIngestSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.sourcesService.getSourceOrThrow(parsed.data.sourceId);

    const activeTargets = await this.targetsService.countActiveTargets(parsed.data.sourceId);
    if (activeTargets === 0) {
      throw new BadRequestException("allowlist is empty. register active sync targets first.");
    }

    const ingestJob = await prisma.ingestJob.create({
      data: {
        sourceId: parsed.data.sourceId,
        mode: parsed.data.mode,
        status: "queued",
        requestedBy
      }
    });

    await this.queueService.enqueueRun({
      sourceId: parsed.data.sourceId,
      mode: parsed.data.mode,
      requestedBy,
      requestedAt: new Date().toISOString(),
      ingestJobId: ingestJob.id
    });

    return {
      jobId: ingestJob.id,
      queued: true
    };
  }

  async listJobs(sourceId?: number): Promise<{
    jobs: Array<{
      jobId: number;
      type: string;
      status: string;
      startedAt: string | null;
      finishedAt: string | null;
      errorMessage: string | null;
    }>;
  }> {
    const jobs = await prisma.ingestJob.findMany({
      where: sourceId ? { sourceId } : undefined,
      orderBy: { id: "desc" },
      take: 100
    });

    return {
      jobs: jobs.map((job) => ({
        jobId: job.id,
        type: job.mode,
        status: job.status,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        errorMessage: job.errorMessage ?? null
      }))
    };
  }

  async getJob(jobId: number): Promise<{
    jobId: number;
    sourceId: number;
    type: string;
    status: string;
    attempt: number;
    startedAt: string | null;
    finishedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }> {
    const job = await prisma.ingestJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Ingest job not found: ${jobId}`);
    }

    return {
      jobId: job.id,
      sourceId: job.sourceId,
      type: job.mode,
      status: job.status,
      attempt: job.attempt,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      errorCode: job.errorCode ?? null,
      errorMessage: job.errorMessage ?? null
    };
  }

  async retryJob(jobId: number, requestedBy: string): Promise<{ jobId: number; queued: true }> {
    const job = await prisma.ingestJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Ingest job not found: ${jobId}`);
    }

    if (job.status !== "failed") {
      throw new BadRequestException("Only failed jobs can be retried");
    }

    const newJob = await prisma.ingestJob.create({
      data: {
        sourceId: job.sourceId,
        mode: job.mode,
        status: "queued",
        requestedBy
      }
    });

    await this.queueService.enqueueRun({
      sourceId: job.sourceId,
      mode: job.mode === "webhook" ? "incremental" : job.mode,
      requestedBy,
      requestedAt: new Date().toISOString(),
      ingestJobId: newJob.id
    });

    return {
      jobId: newJob.id,
      queued: true
    };
  }

  async listPageFailures(input: unknown): Promise<{
    failures: Array<{
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
    }>;
  }> {
    const parsed = listIngestPageFailuresQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.sourcesService.getSourceOrThrow(parsed.data.sourceId);

    const failures = await prisma.ingestPageFailure.findMany({
      where: parsed.data.includeResolved
        ? { sourceId: parsed.data.sourceId }
        : { sourceId: parsed.data.sourceId, status: { in: ["open", "retry_queued"] } },
      orderBy: [{ status: "asc" }, { lastFailedAt: "desc" }],
      take: 200
    });

    const payload = {
      failures: failures.map((failure) => ({
        failureId: failure.id,
        sourceId: failure.sourceId,
        notionPageId: failure.notionPageId,
        status: failure.status,
        failureCount: failure.failureCount,
        targetType: failure.targetType,
        targetIdValue: failure.targetIdValue,
        failureStage: failure.failureStage,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        firstFailedAt: failure.firstFailedAt.toISOString(),
        lastFailedAt: failure.lastFailedAt.toISOString(),
        retryRequestedAt: failure.retryRequestedAt?.toISOString() ?? null,
        retryRequestedBy: failure.retryRequestedBy ?? null,
        resolvedAt: failure.resolvedAt?.toISOString() ?? null,
        resolvedIngestJobId: failure.resolvedIngestJobId ?? null
      }))
    };

    return listIngestPageFailuresResponseSchema.parse(payload);
  }

  async retryPageFailure(failureId: number, requestedBy: string): Promise<{ jobId: number; queued: true }> {
    const failure = await prisma.ingestPageFailure.findUnique({
      where: { id: failureId }
    });

    if (!failure) {
      throw new NotFoundException(`Ingest page failure not found: ${failureId}`);
    }

    if (failure.status === "resolved") {
      throw new BadRequestException("This page failure is already resolved.");
    }

    await this.sourcesService.getSourceOrThrow(failure.sourceId);

    const ingestJob = await prisma.ingestJob.create({
      data: {
        sourceId: failure.sourceId,
        mode: "incremental",
        status: "queued",
        requestedBy
      }
    });

    await prisma.ingestPageFailure.update({
      where: { id: failure.id },
      data: {
        status: "retry_queued",
        retryIngestJobId: ingestJob.id,
        retryRequestedAt: new Date(),
        retryRequestedBy: requestedBy
      }
    });

    await this.queueService.enqueueRun({
      sourceId: failure.sourceId,
      mode: "incremental",
      requestedBy,
      requestedAt: new Date().toISOString(),
      ingestJobId: ingestJob.id,
      pageIds: [failure.notionPageId],
      retryFailureId: failure.id
    });

    return {
      jobId: ingestJob.id,
      queued: true
    };
  }
}
