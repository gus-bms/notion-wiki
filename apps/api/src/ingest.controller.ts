import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req } from "@nestjs/common";
import { IngestService } from "./ingest.service";

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post("ingest/run")
  async runIngest(@Body() body: unknown, @Req() request: { ip?: string }): Promise<{ jobId: number; queued: true }> {
    const requestedBy = request.ip ?? "api";
    return this.ingestService.runIngest(body, requestedBy);
  }

  @Get("ingest/jobs")
  async getJobs(
    @Query("sourceId") sourceId?: string
  ): Promise<{
    jobs: Array<{
      jobId: number;
      type: string;
      status: string;
      startedAt: string | null;
      finishedAt: string | null;
      errorMessage: string | null;
    }>;
  }> {
    return this.ingestService.listJobs(sourceId ? Number(sourceId) : undefined);
  }

  @Get("ingest/jobs/:jobId")
  async getJob(
    @Param("jobId", ParseIntPipe) jobId: number
  ): Promise<{
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
    return this.ingestService.getJob(jobId);
  }

  @Post("ingest/jobs/:jobId/retry")
  async retryJob(
    @Param("jobId", ParseIntPipe) jobId: number,
    @Req() request: { ip?: string }
  ): Promise<{ jobId: number; queued: true }> {
    const requestedBy = request.ip ?? "api";
    return this.ingestService.retryJob(jobId, requestedBy);
  }

  @Get("ingest/page-failures")
  async getPageFailures(
    @Query("sourceId") sourceId?: string,
    @Query("includeResolved") includeResolved?: string
  ): Promise<{
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
    return this.ingestService.listPageFailures({
      sourceId: sourceId ? Number(sourceId) : Number.NaN,
      includeResolved: includeResolved === "1" || includeResolved === "true"
    });
  }

  @Post("ingest/page-failures/:failureId/retry")
  async retryPageFailure(
    @Param("failureId", ParseIntPipe) failureId: number,
    @Req() request: { ip?: string }
  ): Promise<{ jobId: number; queued: true }> {
    const requestedBy = request.ip ?? "api";
    return this.ingestService.retryPageFailure(failureId, requestedBy);
  }

  @Post("notion/webhook")
  async handleNotionWebhook(): Promise<{ ok: true }> {
    return { ok: true };
  }
}
