import { Body, Controller, Param, ParseIntPipe, Post } from "@nestjs/common";
import { SourcesService } from "./sources.service";

@Controller("sources")
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post("notion")
  async createNotionSource(@Body() body: unknown): Promise<{ sourceId: number }> {
    return this.sourcesService.createSource(body);
  }

  @Post(":sourceId/ping")
  async pingSource(@Param("sourceId", ParseIntPipe) sourceId: number): Promise<{ ok: true; sourceId: number }> {
    return this.sourcesService.testConnection(sourceId);
  }
}
