import { chatResponseSchema } from "@notion-wiki/contracts";

export function parseChatResponse(raw: string): {
  answer: string;
  citations: Array<{ chunkId: string; title: string; url: string; quote: string }>;
} {
  try {
    const parsed = JSON.parse(raw);
    const normalized = chatResponseSchema.safeParse({
      sessionId: 1,
      answer: parsed.answer,
      citations: parsed.citations,
      meta: { topK: 8, retrievalMs: 0, llmMs: 0 }
    });
    if (normalized.success) {
      return {
        answer: normalized.data.answer,
        citations: normalized.data.citations
      };
    }
  } catch {
    // Fallback below.
  }

  return {
    answer: raw.trim() || "확인 불가",
    citations: []
  };
}
