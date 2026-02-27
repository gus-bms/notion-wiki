import { z } from "zod";

export const citationSchema = z.object({
  chunkId: z.union([z.string(), z.number()]).transform((value) => String(value)),
  title: z.string().min(1),
  url: z.string().url(),
  quote: z.string().min(1).max(400)
});

export type Citation = z.infer<typeof citationSchema>;
