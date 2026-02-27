import { Body, Controller, Post } from "@nestjs/common";
import { Citation } from "@notion-wiki/contracts";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: unknown): Promise<{
    sessionId: number;
    answer: string;
    citations: Citation[];
    meta: { topK: number; retrievalMs: number; llmMs: number };
  }> {
    return this.chatService.chat(body);
  }
}
