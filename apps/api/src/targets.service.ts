import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createTargetSchema } from "@notion-wiki/contracts";
import { decryptSecret, prisma } from "@notion-wiki/db";
import { NotionClient, NotionSearchEntry } from "@notion-wiki/notion-client";
import { SourcesService } from "./sources.service";

type DiscoveredTarget = {
  targetType: "data_source" | "page";
  targetId: string;
};

@Injectable()
export class TargetsService {
  constructor(private readonly sourcesService: SourcesService) {}

  async createTarget(sourceId: number, input: unknown): Promise<{ targetId: number }> {
    const parsed = createTargetSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.sourcesService.getSourceOrThrow(sourceId);

    const target = await prisma.syncTarget.create({
      data: {
        sourceId,
        targetType: parsed.data.targetType,
        targetIdValue: parsed.data.targetId,
        status: "active"
      }
    });

    return { targetId: target.id };
  }

  async discoverTargets(sourceId: number): Promise<{
    scannedEntries: number;
    discoveredTargets: number;
    createdTargets: number;
    reactivatedTargets: number;
    dataSourceTargets: number;
    pageTargets: number;
  }> {
    const source = await this.sourcesService.getSourceOrThrow(sourceId);
    const notionClient = new NotionClient({
      token: decryptSecret(source.notionTokenEnc),
      notionVersion: source.notionApiVersion,
      requestsPerSecond: Number(process.env.NOTION_REQUESTS_PER_SECOND ?? 3)
    });

    const searchResults = await notionClient.listAllSearchResults();
    const discoveredTargets = this.extractDiscoverableTargets(searchResults);

    const existingTargets = await prisma.syncTarget.findMany({
      where: { sourceId },
      select: {
        id: true,
        targetType: true,
        targetIdValue: true,
        status: true
      }
    });
    const existingByKey = new Map(
      existingTargets.map((target) => [
        this.buildTargetKey(target.targetType, target.targetIdValue),
        target
      ])
    );

    const targetsToCreate = discoveredTargets
      .filter((target) => !existingByKey.has(this.buildTargetKey(target.targetType, target.targetId)))
      .map((target) => ({
        sourceId,
        targetType: target.targetType,
        targetIdValue: target.targetId,
        status: "active" as const
      }));

    const targetsToReactivate: number[] = [];
    for (const target of discoveredTargets) {
      const existingTarget = existingByKey.get(this.buildTargetKey(target.targetType, target.targetId));
      if (existingTarget?.status === "inactive") {
        targetsToReactivate.push(existingTarget.id);
      }
    }

    let createdTargets = 0;
    if (targetsToCreate.length > 0) {
      const createResult = await prisma.syncTarget.createMany({
        data: targetsToCreate,
        skipDuplicates: true
      });
      createdTargets = createResult.count;
    }

    if (targetsToReactivate.length > 0) {
      await prisma.syncTarget.updateMany({
        where: {
          id: {
            in: targetsToReactivate
          }
        },
        data: {
          status: "active"
        }
      });
    }

    return {
      scannedEntries: searchResults.length,
      discoveredTargets: discoveredTargets.length,
      createdTargets,
      reactivatedTargets: targetsToReactivate.length,
      dataSourceTargets: discoveredTargets.filter((target) => target.targetType === "data_source").length,
      pageTargets: discoveredTargets.filter((target) => target.targetType === "page").length
    };
  }

  async listTargets(sourceId: number): Promise<{
    targets: Array<{
      targetId: number;
      targetType: string;
      targetIdValue: string;
      status: "active" | "inactive";
    }>;
  }> {
    await this.sourcesService.getSourceOrThrow(sourceId);
    const targets = await prisma.syncTarget.findMany({
      where: { sourceId },
      orderBy: { id: "desc" }
    });

    return {
      targets: targets.map((target) => ({
        targetId: target.id,
        targetType: target.targetType,
        targetIdValue: target.targetIdValue,
        status: target.status
      }))
    };
  }

  async updateTargetStatus(sourceId: number, targetId: number, status: "active" | "inactive"): Promise<{ ok: true }> {
    await this.sourcesService.getSourceOrThrow(sourceId);
    const target = await prisma.syncTarget.findFirst({ where: { id: targetId, sourceId } });
    if (!target) {
      throw new NotFoundException(`Target not found: ${targetId}`);
    }

    await prisma.syncTarget.update({
      where: { id: targetId },
      data: { status }
    });
    return { ok: true };
  }

  async countActiveTargets(sourceId: number): Promise<number> {
    return prisma.syncTarget.count({ where: { sourceId, status: "active" } });
  }

  private extractDiscoverableTargets(searchResults: NotionSearchEntry[]): DiscoveredTarget[] {
    const discovered = new Map<string, DiscoveredTarget>();

    for (const item of searchResults) {
      if (item.archived || item.in_trash) {
        continue;
      }

      if (item.object === "data_source") {
        const target: DiscoveredTarget = {
          targetType: "data_source",
          targetId: item.id
        };
        discovered.set(this.buildTargetKey(target.targetType, target.targetId), target);
        continue;
      }

      if (item.object !== "page") {
        continue;
      }

      const target: DiscoveredTarget = {
        targetType: "page",
        targetId: item.id
      };
      discovered.set(this.buildTargetKey(target.targetType, target.targetId), target);
    }

    return Array.from(discovered.values());
  }

  private buildTargetKey(targetType: string, targetId: string): string {
    return `${targetType}:${targetId}`;
  }
}
