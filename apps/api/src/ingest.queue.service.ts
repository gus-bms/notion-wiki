import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { JOB_NAMES, IngestRunJobPayload, QUEUE_NAMES } from "@notion-wiki/contracts";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class IngestQueueService implements OnModuleDestroy {
  private readonly redis: IORedis;
  private readonly ingestQueue: Queue;

  constructor() {
    this.redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null
    });
    this.ingestQueue = new Queue(QUEUE_NAMES.ingest, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 500
        },
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    });
  }

  async enqueueRun(payload: IngestRunJobPayload): Promise<void> {
    const jobName = payload.mode === "full" ? JOB_NAMES.ingestFull : JOB_NAMES.ingestIncremental;
    await this.ingestQueue.add(jobName, payload);
  }

  async enqueueRetry(payload: IngestRunJobPayload): Promise<void> {
    await this.ingestQueue.add(JOB_NAMES.ingestDeadletter, payload);
  }

  async onModuleDestroy(): Promise<void> {
    await this.ingestQueue.close();
    await this.redis.quit();
  }
}
