import { z } from "zod";
export declare const citationSchema: z.ZodObject<{
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
}>;
export type Citation = z.infer<typeof citationSchema>;
