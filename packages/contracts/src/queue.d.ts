export type IngestMode = "full" | "incremental";
export interface IngestRunJobPayload {
    sourceId: number;
    mode: IngestMode;
    requestedBy: string;
    requestedAt: string;
    ingestJobId: number;
}
export interface IngestPageJobPayload {
    sourceId: number;
    notionPageId: string;
    targetType: "data_source" | "page";
    targetId: string;
    ingestJobId: number;
}
export interface IngestWebhookPayload {
    sourceId: number;
    entityId: string;
    eventType: string;
    receivedAt: string;
}
export declare const QUEUE_NAMES: {
    readonly ingest: "ingest";
    readonly deadletter: "ingest.deadletter";
};
export declare const JOB_NAMES: {
    readonly ingestFull: "ingest.full";
    readonly ingestIncremental: "ingest.incremental";
    readonly ingestPage: "ingest.page";
    readonly ingestWebhook: "ingest.webhook";
    readonly ingestDeadletter: "ingest.retry.deadletter";
};
