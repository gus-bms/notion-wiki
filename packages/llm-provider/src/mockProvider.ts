import { ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, LlmProvider } from "./contracts";

export class MockProvider implements LlmProvider {
  readonly name = "mock" as const;

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const vectors = request.texts.map((text) => {
      const seed = text.length % 10;
      return Array.from({ length: 8 }, (_, index) => (seed + index) / 10);
    });
    return {
      provider: this.name,
      model: request.model,
      vectors,
      dimensions: vectors[0]?.length ?? 0
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const firstContext = request.contexts[0];
    const fallback = firstContext
      ? `요청하신 내용의 근거 문서: ${firstContext.title} (${firstContext.url})`
      : "확인 가능한 근거가 부족합니다.";
    return {
      provider: this.name,
      model: request.model,
      text: fallback
    };
  }
}
