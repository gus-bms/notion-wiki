import { Module } from "@nestjs/common";
import { IngestWorkerService } from "./worker.service";
import { WorkerHealthController } from "./worker.health.controller";

@Module({
  controllers: [WorkerHealthController],
  providers: [IngestWorkerService]
})
export class WorkerModule {}
