import { Controller, Get } from "@nestjs/common";
import { IngestWorkerService } from "./worker.service";

@Controller()
export class WorkerHealthController {
  constructor(private readonly ingestWorkerService: IngestWorkerService) {}

  @Get("health")
  async getHealth(): Promise<{
    ok: boolean;
    workerInitialized: boolean;
    queueName: string;
    now: string;
  }> {
    return this.ingestWorkerService.getHealthStatus();
  }

  @Get("queue/ping")
  async pingQueue(): Promise<{
    ok: boolean;
    queueName: string;
    redisPing: string;
    counts: Record<string, number>;
    now: string;
  }> {
    return this.ingestWorkerService.getQueuePingStatus();
  }
}
