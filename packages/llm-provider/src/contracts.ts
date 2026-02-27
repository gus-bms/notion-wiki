export type LlmProviderName = "gemini" | "openai" | "mock";

export interface EmbedRequest {
  texts: string[];
  model: string;
  taskType?: "retrieval_document" | "retrieval_query";
  timeoutMs?: number;
}

export interface EmbedResponse {
  provider: LlmProviderName;
  model: string;
  vectors: number[][];
  dimensions: number;
  requestId?: string;
}

export interface ChatRequest {
  model: string;
  systemInstruction: string;
  userMessage: string;
  contexts: Array<{
    chunkId: string;
    title: string;
    url: string;
    text: string;
  }>;
  outputFormat: "plain_text" | "json";
  timeoutMs?: number;
  maxRetries?: number;
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

export interface LlmProvider {
  name: LlmProviderName;
  embed(request: EmbedRequest): Promise<EmbedResponse>;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
