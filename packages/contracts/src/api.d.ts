import { z } from "zod";
export declare const createSourceSchema: z.ZodObject<{
    name: z.ZodString;
    notionIntegrationToken: z.ZodString;
    notionApiVersion: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    notionIntegrationToken: string;
    notionApiVersion: string;
}, {
    name: string;
    notionIntegrationToken: string;
    notionApiVersion?: string | undefined;
}>;
export declare const createTargetSchema: z.ZodObject<{
    targetType: z.ZodEnum<["data_source", "page"]>;
    targetId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    targetType: "data_source" | "page";
    targetId: string;
}, {
    targetType: "data_source" | "page";
    targetId: string;
}>;
export declare const runIngestSchema: z.ZodObject<{
    sourceId: z.ZodNumber;
    mode: z.ZodEnum<["full", "incremental"]>;
}, "strip", z.ZodTypeAny, {
    sourceId: number;
    mode: "full" | "incremental";
}, {
    sourceId: number;
    mode: "full" | "incremental";
}>;
export declare const chatRequestSchema: z.ZodObject<{
    sourceId: z.ZodNumber;
    sessionId: z.ZodOptional<z.ZodNumber>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    sourceId: number;
    sessionId?: number | undefined;
}, {
    message: string;
    sourceId: number;
    sessionId?: number | undefined;
}>;
export declare const chatResponseSchema: z.ZodObject<{
    sessionId: z.ZodNumber;
    answer: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodNumber]>, string, string | number>;
        title: z.ZodString;
        url: z.ZodString;
        quote: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        chunkId: string;
        title: string;
        url: string;
        quote: string;
    }, {
        chunkId: string | number;
        title: string;
        url: string;
        quote: string;
    }>, "many">;
    meta: z.ZodObject<{
        topK: z.ZodNumber;
        retrievalMs: z.ZodNumber;
        llmMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        topK: number;
        retrievalMs: number;
        llmMs: number;
    }, {
        topK: number;
        retrievalMs: number;
        llmMs: number;
    }>;
}, "strip", z.ZodTypeAny, {
    sessionId: number;
    answer: string;
    citations: {
        chunkId: string;
        title: string;
        url: string;
        quote: string;
    }[];
    meta: {
        topK: number;
        retrievalMs: number;
        llmMs: number;
    };
}, {
    sessionId: number;
    answer: string;
    citations: {
        chunkId: string | number;
        title: string;
        url: string;
        quote: string;
    }[];
    meta: {
        topK: number;
        retrievalMs: number;
        llmMs: number;
    };
}>;
export declare const feedbackSchema: z.ZodObject<{
    messageId: z.ZodNumber;
    score: z.ZodUnion<[z.ZodLiteral<-1>, z.ZodLiteral<1>]>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: number;
    score: 1 | -1;
    reason: string;
}, {
    messageId: number;
    score: 1 | -1;
    reason: string;
}>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type RunIngestInput = z.infer<typeof runIngestSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type ChatResponseOutput = z.infer<typeof chatResponseSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
