import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppTokenGuard } from "./auth/auth.guard";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { HealthController } from "./health.controller";
import { IngestController } from "./ingest.controller";
import { IngestQueueService } from "./ingest.queue.service";
import { IngestService } from "./ingest.service";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";
import { TargetsController } from "./targets.controller";
import { TargetsService } from "./targets.service";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";

@Module({
  controllers: [
    ChatController,
    FeedbackController,
    HealthController,
    IngestController,
    SourcesController,
    TargetsController,
    WorkspaceController
  ],
  providers: [
    ChatService,
    FeedbackService,
    IngestQueueService,
    IngestService,
    SourcesService,
    TargetsService,
    WorkspaceService,
    {
      provide: APP_GUARD,
      useClass: AppTokenGuard
    }
  ]
})
export class AppModule {}
