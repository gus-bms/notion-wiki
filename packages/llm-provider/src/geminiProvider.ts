import {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  LlmProvider,
  ProviderError
} from "./contracts";
import { withProviderRetry } from "./retry";

function createProviderError(
  message: string,
  options: { status?: number; code: ProviderError["code"]; retryable: boolean; requestId?: string }
): ProviderError {
  const error = new ProviderError(message);
  error.code = options.code;
  error.status = options.status;
  error.retryable = options.retryable;
  error.requestId = options.requestId;
  return error;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://generativelanguage.googleapis.com/v1beta") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    if (!this.apiKey) {
      throw createProviderError("Missing GEMINI_API_KEY", {
        code: "AUTH_FAILED",
        retryable: false
      });
    }

    const response = await withProviderRetry(
      async () => {
        const fetchResponse = await fetch(
          `${this.baseUrl}/models/${request.model}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: request.texts.map((text) => ({
                model: `models/${request.model}`,
                taskType: request.taskType ?? "RETRIEVAL_DOCUMENT",
                content: {
                  parts: [{ text }]
                }
              }))
            }),
            signal: AbortSignal.timeout(request.timeoutMs ?? 10_000)
          }
        );

        if (!fetchResponse.ok) {
          throw await this.mapError(fetchResponse);
        }

        return fetchResponse.json();
      },
      { maxRetries: 2 }
    );

    const vectors = (response.embeddings ?? []).map((item: { values?: number[] }) => item.values ?? []);
    const dimensions = vectors[0]?.length ?? 0;

    return {
      provider: this.name,
      model: request.model,
      vectors,
      dimensions
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.apiKey) {
      throw createProviderError("Missing GEMINI_API_KEY", {
        code: "AUTH_FAILED",
        retryable: false
      });
    }

    const response = await withProviderRetry(
      async () => {
        const endpoint = `${this.baseUrl}/models/${request.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        let includeSystemInstruction = true;
        let outputFormat: ChatRequest["outputFormat"] = request.outputFormat;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const fetchResponse = await this.requestChat(endpoint, request, includeSystemInstruction, outputFormat);
          if (fetchResponse.ok) {
            return fetchResponse.json();
          }

          const mappedError = await this.mapError(fetchResponse);
          const developerInstructionUnsupported =
            mappedError.code === "BAD_REQUEST" &&
            mappedError.message.includes("Developer instruction is not enabled");
          const jsonModeUnsupported =
            mappedError.code === "BAD_REQUEST" &&
            outputFormat === "json" &&
            mappedError.message.includes("JSON mode is not enabled");

          if (developerInstructionUnsupported && includeSystemInstruction) {
            includeSystemInstruction = false;
            continue;
          }

          if (jsonModeUnsupported) {
            outputFormat = "plain_text";
            continue;
          }

          throw mappedError;
        }

        throw createProviderError("Gemini chat fallback attempts exhausted", {
          code: "UNKNOWN",
          retryable: false
        });
      },
      { maxRetries: request.maxRetries ?? 2 }
    );

    const text =
      response?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";

    return {
      provider: this.name,
      model: request.model,
      text,
      requestId: response?.responseId,
      usage: {
        inputTokens: response?.usageMetadata?.promptTokenCount,
        outputTokens: response?.usageMetadata?.candidatesTokenCount
      }
    };
  }

  private async mapError(response: Response): Promise<ProviderError> {
    const bodyText = await response.text();
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const status = response.status;

    if (status === 401 || status === 403) {
      return createProviderError(bodyText || "Gemini auth failed", {
        code: "AUTH_FAILED",
        retryable: false,
        requestId,
        status
      });
    }

    if (status === 429) {
      return createProviderError(bodyText || "Gemini rate limited", {
        code: "RATE_LIMITED",
        retryable: true,
        requestId,
        status
      });
    }

    if (status >= 500) {
      return createProviderError(bodyText || "Gemini server error", {
        code: "SERVER_ERROR",
        retryable: true,
        requestId,
        status
      });
    }

    if (status >= 400) {
      return createProviderError(bodyText || "Gemini bad request", {
        code: "BAD_REQUEST",
        retryable: false,
        requestId,
        status
      });
    }

    return createProviderError(bodyText || "Gemini unknown error", {
      code: "UNKNOWN",
      retryable: false,
      requestId,
      status
    });
  }

  private async requestChat(
    endpoint: string,
    request: ChatRequest,
    includeSystemInstruction: boolean,
    outputFormat: ChatRequest["outputFormat"]
  ): Promise<Response> {
    const promptContext = request.contexts
      .map(
        (ctx) =>
          `chunkId=${ctx.chunkId}\ntitle=${ctx.title}\nurl=${ctx.url}\ntext=${ctx.text}`
      )
      .join("\n\n---\n\n");

    const userText = includeSystemInstruction
      ? `QUESTION:\n${request.userMessage}\n\nCONTEXT:\n${promptContext}`
      : `SYSTEM RULES:\n${request.systemInstruction}\n\nQUESTION:\n${request.userMessage}\n\nCONTEXT:\n${promptContext}`;

    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(includeSystemInstruction
          ? {
              systemInstruction: {
                parts: [{ text: request.systemInstruction }]
              }
            }
          : {}),
        contents: [
          {
            role: "user",
            parts: [
              {
                text: userText
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: outputFormat === "json" ? "application/json" : "text/plain"
        }
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? 30_000)
    });
  }
}
