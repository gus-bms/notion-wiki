import { chatResponseSchema } from "@notion-wiki/contracts";

export function parseChatResponse(raw: string): {
  answer: string;
  citations: Array<{
    chunkId: string;
    title: string;
    url: string;
    quote: string;
  }>;
} {
  const separator = "---CITATIONS---";
  const [answerPart, citationPart] = raw.split(separator);

  const answer = (answerPart || "").trim() || "확인 불가";
  let citations: any[] = [];

  if (citationPart) {
    try {
      // Find the first [ and last ] to extract JSON if LLM added any wrapping
      const start = citationPart.indexOf("[");
      const end = citationPart.lastIndexOf("]") + 1;
      if (start !== -1 && end !== -1) {
        const jsonStr = citationPart.substring(start, end);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          citations = parsed;
        }
      }
    } catch (e) {
      console.error("Failed to parse citations JSON:", e);
    }
  }

  return {
    answer,
    citations,
  };
}
