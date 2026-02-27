"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackSchema = exports.chatResponseSchema = exports.chatRequestSchema = exports.runIngestSchema = exports.createTargetSchema = exports.createSourceSchema = void 0;
const zod_1 = require("zod");
const citation_1 = require("./citation");
exports.createSourceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    notionIntegrationToken: zod_1.z.string().min(1),
    notionApiVersion: zod_1.z.string().min(1).default("2025-09-03")
});
exports.createTargetSchema = zod_1.z.object({
    targetType: zod_1.z.enum(["data_source", "page"]),
    targetId: zod_1.z.string().min(1)
});
exports.runIngestSchema = zod_1.z.object({
    sourceId: zod_1.z.number().int().positive(),
    mode: zod_1.z.enum(["full", "incremental"])
});
exports.chatRequestSchema = zod_1.z.object({
    sourceId: zod_1.z.number().int().positive(),
    sessionId: zod_1.z.number().int().positive().optional(),
    message: zod_1.z.string().min(1)
});
exports.chatResponseSchema = zod_1.z.object({
    sessionId: zod_1.z.number().int().positive(),
    answer: zod_1.z.string().min(1),
    citations: zod_1.z.array(citation_1.citationSchema),
    meta: zod_1.z.object({
        topK: zod_1.z.number().int().positive(),
        retrievalMs: zod_1.z.number().nonnegative(),
        llmMs: zod_1.z.number().nonnegative()
    })
});
exports.feedbackSchema = zod_1.z.object({
    messageId: zod_1.z.number().int().positive(),
    score: zod_1.z.union([zod_1.z.literal(-1), zod_1.z.literal(1)]),
    reason: zod_1.z.string().min(1).max(300)
});
//# sourceMappingURL=api.js.map