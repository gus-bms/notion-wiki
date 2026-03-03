import { chatResponseSchema } from "@notion-wiki/contracts";

export function parseChatResponse(raw: string): {
  answer: string;
  citations: Array<{ chunkId: string; title: string; url: string; quote: string }>;
} {
  return {
    answer: raw.trim() || "확인 불가",
    citations: []
  };
}
