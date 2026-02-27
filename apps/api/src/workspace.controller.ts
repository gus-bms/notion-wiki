import { Body, Controller, Get, Post } from "@nestjs/common";
import { WorkspaceBootstrapOutput, WorkspaceLoginResponseOutput } from "@notion-wiki/contracts";
import { WorkspaceService } from "./workspace.service";

@Controller("workspace")
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get("bootstrap")
  async bootstrap(): Promise<WorkspaceBootstrapOutput> {
    return this.workspaceService.bootstrap();
  }

  @Post("login")
  async login(@Body() body: unknown): Promise<WorkspaceLoginResponseOutput> {
    return this.workspaceService.login(body);
  }
}
