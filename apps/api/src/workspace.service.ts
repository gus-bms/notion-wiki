import { BadRequestException, Injectable } from "@nestjs/common";
import {
  workspaceLoginSchema,
  WorkspaceBootstrapOutput,
  WorkspaceLoginResponseOutput
} from "@notion-wiki/contracts";
import { prisma } from "@notion-wiki/db";
import { log } from "@notion-wiki/observability";
import { IngestService } from "./ingest.service";
import { SourcesService } from "./sources.service";
import { TargetsService } from "./targets.service";

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly ingestService: IngestService,
    private readonly sourcesService: SourcesService,
    private readonly targetsService: TargetsService
  ) {}

  async bootstrap(): Promise<WorkspaceBootstrapOutput> {
    const source = await this.sourcesService.getDefaultActiveSource();
    if (!source) {
      return {
        hasSource: false,
        source: null,
        latestIngestJob: null
      };
    }

    const [activeTargetCount, documentCount, latestIngestJob] = await Promise.all([
      this.targetsService.countActiveTargets(source.id),
      prisma.document.count({ where: { sourceId: source.id, status: "active" } }),
      prisma.ingestJob.findFirst({
        where: { sourceId: source.id },
        orderBy: { id: "desc" }
      })
    ]);

    return {
      hasSource: true,
      source: {
        sourceId: source.id,
        name: source.name,
        notionApiVersion: source.notionApiVersion,
        status: source.status,
        activeTargetCount,
        documentCount
      },
      latestIngestJob: latestIngestJob
        ? {
            jobId: latestIngestJob.id,
            status: latestIngestJob.status,
            mode: latestIngestJob.mode,
            startedAt: latestIngestJob.startedAt?.toISOString() ?? null,
            finishedAt: latestIngestJob.finishedAt?.toISOString() ?? null
          }
        : null
    };
  }

  async login(input: unknown): Promise<WorkspaceLoginResponseOutput> {
    const parsed = workspaceLoginSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const defaultSource = await this.sourcesService.getDefaultActiveSource();
    const mode: "created" | "updated" = defaultSource ? "updated" : "created";

    const sourceId = defaultSource
      ? (
          await this.sourcesService.updateSourceCredentials({
            sourceId: defaultSource.id,
            name: parsed.data.name,
            notionIntegrationToken: parsed.data.notionIntegrationToken,
            notionApiVersion: parsed.data.notionApiVersion
          })
        ).sourceId
      : (
          await this.sourcesService.createSource({
            name: parsed.data.name,
            notionIntegrationToken: parsed.data.notionIntegrationToken,
            notionApiVersion: parsed.data.notionApiVersion
          })
        ).sourceId;

    const discovery = parsed.data.autoDiscoverTargets
      ? await this.targetsService.discoverTargets(sourceId)
      : null;

    const activeTargetCount = await this.targetsService.countActiveTargets(sourceId);
    let fullSyncJob: { jobId: number; queued: true } | null = null;

    if (parsed.data.autoRunFullSync && activeTargetCount > 0) {
      try {
        fullSyncJob = await this.ingestService.runIngest(
          {
            sourceId,
            mode: "full"
          },
          "workspace-login"
        );
      } catch (error) {
        log("warn", "workspace.login.auto_full_sync_failed", {
          sourceId,
          message: error instanceof Error ? error.message : "auto full sync queue failed"
        });
        fullSyncJob = null;
      }
    }

    return {
      sourceId,
      mode,
      activeTargetCount,
      discovery,
      fullSyncJob
    };
  }
}
