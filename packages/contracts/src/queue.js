"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_NAMES = exports.QUEUE_NAMES = void 0;
exports.QUEUE_NAMES = {
    ingest: "ingest",
    deadletter: "ingest.deadletter"
};
exports.JOB_NAMES = {
    ingestFull: "ingest.full",
    ingestIncremental: "ingest.incremental",
    ingestPage: "ingest.page",
    ingestWebhook: "ingest.webhook",
    ingestDeadletter: "ingest.retry.deadletter"
};
//# sourceMappingURL=queue.js.map