import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { QUEUE_NAMES } from "@notion-wiki/contracts";
import { QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { Subject, Observable } from "rxjs";

export interface JobEvent {
  type: "active" | "completed" | "failed" | "waiting";
  jobId: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class IngestJobEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: IORedis;
  private queueEvents!: QueueEvents;
  private readonly subject = new Subject<JobEvent>();

  constructor() {
    this.redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null
    });
  }

  async onModuleInit(): Promise<void> {
    this.queueEvents = new QueueEvents(QUEUE_NAMES.ingest, {
      connection: this.redis.duplicate()
    });

    this.queueEvents.on("active", ({ jobId }) => {
      this.subject.next({ type: "active", jobId });
    });

    this.queueEvents.on("completed", ({ jobId }) => {
      this.subject.next({ type: "completed", jobId });
    });

    this.queueEvents.on("failed", ({ jobId }) => {
      this.subject.next({ type: "failed", jobId });
    });

    this.queueEvents.on("waiting", ({ jobId }) => {
      this.subject.next({ type: "waiting", jobId });
    });
  }

  getStream(): Observable<JobEvent> {
    return this.subject.asObservable();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents?.close();
    await this.redis.quit();
  }
}
