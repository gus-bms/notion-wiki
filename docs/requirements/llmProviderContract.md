# LLM Provider Contract (Gemini-first)

> 목표: Gemini 기반 구현이지만, provider 교체(OpenAI/Local 등)가 가능하도록 공통 인터페이스를 고정한다.

```ts
export type LlmProviderName = "gemini" | "openai" | "mock";

export interface EmbedRequest {
  texts: string[];
  model: string; // ex) "gemini-embedding-001"
  taskType?: "retrieval_document" | "retrieval_query";
  timeoutMs?: number; // default 10_000
}

export interface EmbedResponse {
  provider: LlmProviderName;
  model: string;
  vectors: number[][];
  dimensions: number;
  requestId?: string;
}

export interface ChatRequest {
  model: string; // ex) "gemini-2.5-flash"
  systemInstruction: string;
  userMessage: string;

  contexts: Array<{
    chunkId: string;
    title: string;
    url: string;
    text: string;
  }>;

  outputFormat: "plain_text" | "json";
  timeoutMs?: number; // default 30_000
  maxRetries?: number; // default 2
}

export interface ChatResponse {
  provider: LlmProviderName;
  model: string;
  text: string;
  requestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export type ProviderErrorCode =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "AUTH_FAILED"
  | "SERVER_ERROR"
  | "UPSTREAM_UNAVAILABLE"
  | "UNKNOWN";

export class ProviderError extends Error {
  code!: ProviderErrorCode;
  status?: number;
  retryable!: boolean;
  requestId?: string;
}
```

## Error/Retry Policy (요약)
- retryable: TIMEOUT, RATE_LIMITED(429), SERVER_ERROR(5xx), UPSTREAM_UNAVAILABLE
- backoff: exponential + jitter (base 500ms, max 10s)
- Notion은 Retry-After 최우선
