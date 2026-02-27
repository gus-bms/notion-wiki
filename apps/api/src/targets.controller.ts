import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { TargetsService } from "./targets.service";

@Controller("sources/:sourceId/targets")
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  async createTarget(
    @Param("sourceId", ParseIntPipe) sourceId: number,
    @Body() body: unknown
  ): Promise<{ targetId: number }> {
    return this.targetsService.createTarget(sourceId, body);
  }

  @Get()
  async listTargets(
    @Param("sourceId", ParseIntPipe) sourceId: number
  ): Promise<{
    targets: Array<{ targetId: number; targetType: string; targetIdValue: string; status: "active" | "inactive" }>;
  }> {
    return this.targetsService.listTargets(sourceId);
  }

  @Post("discover")
  async discoverTargets(@Param("sourceId", ParseIntPipe) sourceId: number): Promise<{
    scannedEntries: number;
    discoveredTargets: number;
    createdTargets: number;
    reactivatedTargets: number;
    dataSourceTargets: number;
    pageTargets: number;
  }> {
    return this.targetsService.discoverTargets(sourceId);
  }

  @Patch(":targetId")
  async patchTargetStatus(
    @Param("sourceId", ParseIntPipe) sourceId: number,
    @Param("targetId", ParseIntPipe) targetId: number,
    @Body() body: { status: "active" | "inactive" }
  ): Promise<{ ok: true }> {
    if (!body || (body.status !== "active" && body.status !== "inactive")) {
      throw new BadRequestException("status must be active or inactive");
    }
    return this.targetsService.updateTargetStatus(sourceId, targetId, body.status);
  }
}
