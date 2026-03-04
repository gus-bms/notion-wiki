import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  Citation,
  ChatSessionListOutput,
  ChatSessionDetailOutput,
} from "@notion-wiki/contracts";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: unknown): Promise<{
    sessionId: number;
    answer: string;
    citations: Citation[];
    documents: Array<{
      documentId: number;
      title: string;
      url: string;
      lastEditedAt: string | null;
    }>;
    meta: { topK: number; retrievalMs: number; llmMs: number };
  }> {
    return this.chatService.chat(body);
  }

  @Get("sessions")
  async getSessions(
    @Query("sourceId", ParseIntPipe) sourceId: number,
  ): Promise<ChatSessionListOutput> {
    return this.chatService.getSessions(sourceId);
  }

  @Get("sessions/:id")
  async getSessionDetails(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ChatSessionDetailOutput> {
    return this.chatService.getSessionDetails(id);
  }

  @Delete("sessions/:id")
  async deleteSession(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ deleted: boolean }> {
    return this.chatService.deleteSession(id);
  }
}
