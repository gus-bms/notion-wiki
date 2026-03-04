import { Injectable } from "@nestjs/common";
import { chatRequestSchema, Citation } from "@notion-wiki/contracts";
import { prisma } from "@notion-wiki/db";
import { GeminiProvider } from "@notion-wiki/llm-provider";
import { log } from "@notion-wiki/observability";
import { parseChatResponse, DEFAULT_SYSTEM_PROMPT } from "@notion-wiki/prompts";
import { toCitation, validateCitations } from "@notion-wiki/retrieval";
import { QdrantClient } from "@notion-wiki/vector-store";

interface ChatDocument {
  documentId: number;
  title: string;
  url: string;
  lastEditedAt: string | null;
}

interface RetrievalResult {
  id: string | number;
  score: number;
  payload: {
    chunkId?: string;
    sourceId: number;
    documentId: number;
    notionPageId: string;
    chunkIndex: number;
    title: string;
    url: string;
    text: string;
    anchor?: string;
    lastEditedAt?: string;
    status: "active" | "deleted";
  };
}

interface HybridRetrievalOutput {
  results: RetrievalResult[];
  semanticCount: number;
  lexicalCount: number;
}

@Injectable()
export class ChatService {
  private readonly qdrant = new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION ?? "notion_chunks",
  });

  /**
   * Lazy Recovery: before selecting a key, automatically reactivate keys
   * whose cooldown has expired.
   *   - RPM/TPM limit → recover after 60 seconds
   *   - RPD limit     → recover after midnight (date change)
   */
  private async getActiveApiKey(): Promise<{ id: number; key: string } | null> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const todayMidnight = new Date(now.toISOString().slice(0, 10)); // 00:00:00 UTC today

    // Recover RPM/TPM-limited keys (1 min cooldown)
    await prisma.llmApiKey.updateMany({
      where: {
        status: "limited",
        limitReason: "rpm",
        limitedAt: { lt: oneMinuteAgo },
      },
      data: { status: "active", limitReason: null, limitedAt: null },
    });

    // Recover RPD-limited keys (daily reset)
    await prisma.llmApiKey.updateMany({
      where: {
        status: "limited",
        limitReason: "rpd",
        limitedAt: { lt: todayMidnight },
      },
      data: { status: "active", limitReason: null, limitedAt: null },
    });

    // Select the least-recently-used active key
    const keys = await prisma.llmApiKey.findMany({
      where: { status: "active" },
      orderBy: { lastUsedAt: "asc" },
    });

    if (keys.length > 0) {
      return keys[0];
    }

    // Fallback to .env if DB has no keys at all
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
      return { id: -1, key: envKey };
    }

    return null;
  }

  /**
   * Detect whether a 429 error is RPM/TPM (per-minute) or RPD (per-day).
   * Checks the full error structure including Gemini's nested quotaFailure details.
   */
  private detectLimitReason(error: any): "rpm" | "rpd" {
    try {
      const fullText = JSON.stringify(error).toLowerCase();
      if (
        fullText.includes("perday") ||
        fullText.includes("per day") ||
        fullText.includes("per_day") ||
        fullText.includes("daily")
      ) {
        return "rpd";
      }
    } catch {
      // JSON.stringify failed, fall through to simple check
    }
    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("per day") || msg.includes("daily")) {
      return "rpd";
    }
    return "rpm"; // Default to RPM (safer: 1 min recovery)
  }

  async chat(input: unknown): Promise<{
    sessionId: number;
    answer: string;
    citations: Citation[];
    documents: ChatDocument[];
    meta: { topK: number; retrievalMs: number; llmMs: number };
  }> {
    const parsed = chatRequestSchema.parse(input);
    const topK = 8;

    const session =
      parsed.sessionId !== undefined
        ? await prisma.chatSession.findUnique({
            where: { id: parsed.sessionId },
          })
        : await prisma.chatSession.create({
            data: { sourceId: parsed.sourceId },
          });

    const activeSession =
      session ??
      (await prisma.chatSession.create({
        data: { sourceId: parsed.sourceId },
      }));

    await prisma.chatMessage.create({
      data: {
        sessionId: activeSession.id,
        role: "user",
        messageText: parsed.message,
      },
    });

    const retrievalStartedAt = Date.now();
    let retrievalResults: RetrievalResult[] = [];
    let semanticCandidateCount = 0;
    let lexicalCandidateCount = 0;
    let hybridEnabled = false;

    const lexicalCandidate = this.extractLexicalCandidate(parsed.message);
    const exactLookupRequested = lexicalCandidate !== null;
    const temporalRange = this.detectTemporalRange(parsed.message) ?? undefined;
    let partialLexicalUsed = false;

    if (lexicalCandidate) {
      retrievalResults = await this.findLexicalMatches(
        parsed.sourceId,
        lexicalCandidate,
        topK,
      );
      if (retrievalResults.length === 0 && exactLookupRequested) {
        retrievalResults = await this.findPartialLexicalMatches(
          parsed.sourceId,
          lexicalCandidate,
          topK,
        );
        partialLexicalUsed = retrievalResults.length > 0;
      }
    }

    if (retrievalResults.length < topK) {
      const hybrid = await this.retrieveHybridResults(
        parsed.sourceId,
        parsed.message,
        topK,
        temporalRange,
      );
      const existingIds = new Set(retrievalResults.map((r) => r.id));
      for (const res of hybrid.results) {
        if (!existingIds.has(res.id)) {
          retrievalResults.push(res);
        }
      }
      // Re-apply diversity limit just in case combining them exceeded it locally
      retrievalResults = this.applyDocumentDiversityLimit(
        retrievalResults,
        topK,
        2,
      );
      semanticCandidateCount = hybrid.semanticCount;
      lexicalCandidateCount = hybrid.lexicalCount;
      hybridEnabled = true;
    }

    const retrievalMs = Date.now() - retrievalStartedAt;

    const contexts = retrievalResults.map((result) => ({
      chunkId: result.payload.chunkId ?? String(result.id),
      title: result.payload.title,
      url: result.payload.url,
      text: result.payload.text,
    }));

    let answer = "Cannot verify";
    let citations: Citation[] = [];
    let llmMs = 0;

    if (contexts.length > 0) {
      const maxAttempts = 3;
      let attempt = 0;
      let success = false;

      while (attempt < maxAttempts && !success) {
        attempt++;
        const apiKeyInfo = await this.getActiveApiKey();

        if (!apiKeyInfo) {
          log("error", "chat.llm.no_keys_available");
          answer =
            "No LLM API keys available. Please check system configuration.";
          break;
        }

        const currentProvider = new GeminiProvider(apiKeyInfo.key);
        const llmStartedAt = Date.now();

        try {
          const todayDate = new Date().toISOString().slice(0, 10);
          const rawResponse = await currentProvider.chat({
            model: process.env.GEMINI_CHAT_MODEL ?? "gemini-1.5-flash",
            outputFormat: "plain_text",
            systemInstruction: `${DEFAULT_SYSTEM_PROMPT}\n\nToday's date: ${todayDate}`,
            userMessage: parsed.message,
            contexts,
          });

          llmMs += Date.now() - llmStartedAt;
          const parsedResponse = parseChatResponse(rawResponse.text);
          answer = parsedResponse.answer || "Cannot verify";

          try {
            citations = validateCitations(parsedResponse.citations);
          } catch {
            citations = [];
          }

          // Update lastUsedAt for the key
          if (apiKeyInfo.id !== -1) {
            await prisma.llmApiKey.update({
              where: { id: apiKeyInfo.id },
              data: { lastUsedAt: new Date() },
            });
          }

          success = true;
        } catch (error: any) {
          const llmDuration = Date.now() - llmStartedAt;
          llmMs += llmDuration;

          const status = error?.status || error?.response?.status;
          const message =
            error instanceof Error ? error.message : String(error);

          log("warn", `chat.llm.attempt_failed`, {
            attempt,
            apiKeyId: apiKeyInfo.id,
            status,
            message,
          });

          // Handle Rate Limit (429)
          if (status === 429 && apiKeyInfo.id !== -1) {
            const reason = this.detectLimitReason(error);
            log("info", "chat.llm.key_rate_limited", {
              apiKeyId: apiKeyInfo.id,
              limitReason: reason,
            });
            await prisma.llmApiKey.update({
              where: { id: apiKeyInfo.id },
              data: {
                status: "limited",
                limitReason: reason,
                limitedAt: new Date(),
              },
            });
            continue; // Try with another key
          }

          // Handle Invalid Key (401/403)
          if ((status === 401 || status === 403) && apiKeyInfo.id !== -1) {
            await prisma.llmApiKey.update({
              where: { id: apiKeyInfo.id },
              data: {
                status: "invalid",
                invalidatedAt: new Date(),
              },
            });
            continue;
          }

          // Other errors or fallback reached its end
          answer = "LLM generation failed. Please try again later.";
          break;
        }
      }
    } else {
      answer = "Cannot verify: no relevant evidence found.";
    }

    // Priority 1: Filter documents by actual LLM citations
    const citedUrls = new Set(citations.map((c) => c.url));

    // Priority 2: Fallback to top retrieved documents if answer is substantive but citations are missing
    const isSubstantiveAnswer =
      answer !== "Cannot verify" &&
      answer !== "Cannot verify: no relevant evidence found." &&
      !answer.startsWith("확인 불가");

    let documents: ChatDocument[] = [];

    if (citedUrls.size > 0 || isSubstantiveAnswer) {
      const seenDocumentIds = new Set<number>();

      if (citedUrls.size > 0) {
        // Strict filtering by citations
        for (const r of retrievalResults) {
          if (citedUrls.has(r.payload.url)) {
            seenDocumentIds.add(r.payload.documentId);
          }
        }
      } else {
        // Fallback: Show only top 3 to reduce noise
        for (const r of retrievalResults.slice(0, 3)) {
          seenDocumentIds.add(r.payload.documentId);
        }
      }

      if (seenDocumentIds.size > 0) {
        const freshDocuments = await prisma.document.findMany({
          where: { id: { in: Array.from(seenDocumentIds) } },
          select: { id: true, title: true, url: true, lastEditedAt: true },
        });

        const freshMap = new Map(freshDocuments.map((d) => [d.id, d]));
        const documentMap = new Map<number, ChatDocument>();

        // Re-iterate retrievalResults to preserve the metadata from payload if fresh lookup fails
        for (const r of retrievalResults) {
          const docId = r.payload.documentId;
          if (!seenDocumentIds.has(docId) || documentMap.has(docId)) continue;

          const fresh = freshMap.get(docId);
          documentMap.set(docId, {
            documentId: docId,
            title: fresh?.title ?? r.payload.title,
            url: fresh?.url ?? r.payload.url,
            lastEditedAt:
              fresh?.lastEditedAt?.toISOString() ??
              r.payload.lastEditedAt ??
              null,
          });
        }
        documents = Array.from(documentMap.values());
      }
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: activeSession.id,
        role: "assistant",
        messageText: parsed.message,
        answerText: answer,
        citationsJson: citations,
        documentsJson: JSON.parse(JSON.stringify(documents)),
        metaJson: { topK, retrievalMs, llmMs },
      },
    });

    await prisma.retrievalLog.create({
      data: {
        messageId: assistantMessage.id,
        queryText: parsed.message,
        topK,
        chunkIdsJson: retrievalResults.map((item) => String(item.id)),
        scoresJson: retrievalResults.map((item) => item.score),
        contextTokensEst: contexts.reduce(
          (acc, cur) => acc + Math.ceil(cur.text.length / 4),
          0,
        ),
        retrievalMs,
        llmMs,
        cacheHit: false,
      },
    });

    log("info", "chat.completed", {
      sourceId: parsed.sourceId,
      sessionId: activeSession.id,
      topK,
      retrievalMs,
      llmMs,
      citationCount: citations.length,
      lexicalCandidate: lexicalCandidate ?? null,
      usedLexical: exactLookupRequested
        ? retrievalResults.length > 0
        : lexicalCandidateCount > 0,
      exactLookupRequested,
      partialLexicalUsed,
      hybridEnabled,
      semanticCandidateCount,
      lexicalCandidateCount,
    });

    return {
      sessionId: activeSession.id,
      answer,
      citations,
      documents,
      meta: { topK, retrievalMs, llmMs },
    };
  }

  async getSessions(sourceId: number) {
    const sessions = await prisma.chatSession.findMany({
      where: { sourceId },
      include: {
        messages: {
          where: { role: "user" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.messages[0]?.messageText.slice(0, 40) ?? "New Chat",
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  async deleteSession(sessionId: number): Promise<{ deleted: boolean }> {
    await prisma.chatSession.delete({
      where: { id: sessionId },
    });
    return { deleted: true };
  }

  async getSessionDetails(sessionId: number) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    return {
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      messages: session.messages.map((m) => {
        const citations = m.citationsJson
          ? (m.citationsJson as unknown as Citation[])
          : undefined;
        const documents = m.documentsJson
          ? (m.documentsJson as unknown as ChatDocument[])
          : [];
        const meta = m.metaJson
          ? (m.metaJson as { topK: number; retrievalMs: number; llmMs: number })
          : undefined;

        return {
          id: m.id,
          role: m.role,
          messageText: m.messageText,
          answerText: m.answerText,
          citations,
          documents,
          meta,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    };
  }

  private extractLexicalCandidate(prompt: string): string | null {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return null;
    }

    const quoteRegex = /["'“”‘’]([^"'“”‘’]{6,})["'“”‘’]/g;
    const quoted: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = quoteRegex.exec(trimmed)) !== null) {
      quoted.push(match[1].trim());
    }

    if (quoted.length > 0) {
      quoted.sort((a, b) => b.length - a.length);
      return quoted[0];
    }

    return null;
  }

  private detectTemporalRange(
    message: string,
  ): { dateFrom: string; dateTo: string } | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfDay = (d: Date): Date => {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    if (/오늘/.test(message)) {
      return {
        dateFrom: today.toISOString(),
        dateTo: endOfDay(today).toISOString(),
      };
    }

    if (/어제/.test(message)) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        dateFrom: yesterday.toISOString(),
        dateTo: endOfDay(yesterday).toISOString(),
      };
    }

    if (/이번\s*주/.test(message)) {
      const startOfWeek = new Date(today);
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(today.getDate() - daysToMonday);
      return {
        dateFrom: startOfWeek.toISOString(),
        dateTo: endOfDay(today).toISOString(),
      };
    }

    if (/지난\s*주/.test(message)) {
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const startOfThisWeek = new Date(today);
      startOfThisWeek.setDate(today.getDate() - daysToMonday);
      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
      const endOfLastWeek = new Date(startOfThisWeek);
      endOfLastWeek.setDate(startOfThisWeek.getDate() - 1);
      return {
        dateFrom: startOfLastWeek.toISOString(),
        dateTo: endOfDay(endOfLastWeek).toISOString(),
      };
    }

    if (/이번\s*달/.test(message)) {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        dateFrom: startOfMonth.toISOString(),
        dateTo: endOfDay(today).toISOString(),
      };
    }

    if (/지난\s*달/.test(message)) {
      const startOfLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        dateFrom: startOfLastMonth.toISOString(),
        dateTo: endOfDay(endOfLastMonth).toISOString(),
      };
    }

    if (/올해/.test(message)) {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      return {
        dateFrom: startOfYear.toISOString(),
        dateTo: endOfDay(today).toISOString(),
      };
    }

    if (/최근/.test(message)) {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      return {
        dateFrom: thirtyDaysAgo.toISOString(),
        dateTo: endOfDay(today).toISOString(),
      };
    }

    return null;
  }

  private async findLexicalMatches(
    sourceId: number,
    query: string,
    limit: number,
  ): Promise<RetrievalResult[]> {
    const chunks = await prisma.documentChunk.findMany({
      where: {
        chunkText: {
          contains: query,
        },
        document: {
          sourceId,
          status: "active",
        },
      },
      include: {
        document: {
          select: {
            id: true,
            sourceId: true,
            notionPageId: true,
            title: true,
            url: true,
            status: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      take: limit,
    });

    return chunks.map((chunk, index) => ({
      id: chunk.chunkId,
      score: Math.max(0.5, 1 - index * 0.01),
      payload: {
        chunkId: chunk.chunkId,
        sourceId: chunk.document.sourceId,
        documentId: chunk.document.id,
        notionPageId: chunk.document.notionPageId,
        chunkIndex: chunk.chunkIndex,
        title: chunk.document.title,
        url: chunk.document.url,
        text: chunk.chunkText,
        status: chunk.document.status === "active" ? "active" : "deleted",
      },
    }));
  }

  private async findPartialLexicalMatches(
    sourceId: number,
    query: string,
    limit: number,
    temporalRange?: { dateFrom: string; dateTo: string },
  ): Promise<RetrievalResult[]> {
    const tokens = this.extractSearchTokens(query);
    if (tokens.length === 0) {
      return [];
    }

    const dateFilter = temporalRange
      ? {
          lastEditedAt: {
            gte: new Date(temporalRange.dateFrom),
            lte: new Date(temporalRange.dateTo),
          },
        }
      : {};

    const candidates = await prisma.documentChunk.findMany({
      where: {
        document: {
          sourceId,
          status: "active",
          ...dateFilter,
        },
        OR: tokens.map((token) => ({
          chunkText: {
            contains: token,
          },
        })),
      },
      include: {
        document: {
          select: {
            id: true,
            sourceId: true,
            notionPageId: true,
            title: true,
            url: true,
            status: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      take: 100,
    });

    const scored = candidates
      .map((chunk) => {
        const hitCount = tokens.reduce(
          (count, token) =>
            chunk.chunkText.includes(token) ? count + 1 : count,
          0,
        );
        return { chunk, hitCount };
      })
      .filter((item) => item.hitCount > 0)
      .sort((a, b) => {
        if (b.hitCount !== a.hitCount) {
          return b.hitCount - a.hitCount;
        }
        return b.chunk.id - a.chunk.id;
      })
      .slice(0, limit);

    return scored.map((item) => ({
      id: item.chunk.chunkId,
      score: item.hitCount,
      payload: {
        chunkId: item.chunk.chunkId,
        sourceId: item.chunk.document.sourceId,
        documentId: item.chunk.document.id,
        notionPageId: item.chunk.document.notionPageId,
        chunkIndex: item.chunk.chunkIndex,
        title: item.chunk.document.title,
        url: item.chunk.document.url,
        text: item.chunk.chunkText,
        status: item.chunk.document.status === "active" ? "active" : "deleted",
      },
    }));
  }

  private extractSearchTokens(query: string): string[] {
    const tokens = query
      .split(/[\s,.:;!?()[\]{}\"'“”‘’/\\|<>@#$%^&*+=~`-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    const uniqueTokens = Array.from(new Set(tokens));
    uniqueTokens.sort((a, b) => b.length - a.length);
    return uniqueTokens.slice(0, 10);
  }

  private async retrieveHybridResults(
    sourceId: number,
    message: string,
    topK: number,
    temporalRange?: { dateFrom: string; dateTo: string },
  ): Promise<HybridRetrievalOutput> {
    const result = await this.executeHybridRetrieval(
      sourceId,
      message,
      topK,
      temporalRange,
    );

    // Fallback: if temporal filter returned nothing, retry without date restriction.
    if (temporalRange && result.results.length === 0) {
      log("info", "chat.hybrid.temporal_fallback", {
        sourceId,
        dateFrom: temporalRange.dateFrom,
        dateTo: temporalRange.dateTo,
      });
      return this.executeHybridRetrieval(sourceId, message, topK, undefined);
    }

    return result;
  }

  private async executeHybridRetrieval(
    sourceId: number,
    message: string,
    topK: number,
    temporalRange?: { dateFrom: string; dateTo: string },
  ): Promise<HybridRetrievalOutput> {
    const semanticLimit = Math.max(topK * 4, 24);
    const lexicalLimit = Math.max(topK * 6, 48);

    const lexicalResults = await this.findPartialLexicalMatches(
      sourceId,
      message,
      lexicalLimit,
      temporalRange,
    );

    let semanticResults: RetrievalResult[] = [];
    {
      const maxEmbedAttempts = 3;
      let embedAttempt = 0;
      let embedSuccess = false;

      while (embedAttempt < maxEmbedAttempts && !embedSuccess) {
        embedAttempt++;
        const embedKeyInfo = await this.getActiveApiKey();
        if (!embedKeyInfo) {
          log("warn", "chat.embed.no_keys_available");
          break;
        }

        try {
          const embedProvider = new GeminiProvider(embedKeyInfo.key);
          const embedResponse = await embedProvider.embed({
            texts: [message],
            model: process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
            taskType: "retrieval_query",
          });

          semanticResults = (await this.searchWithCollectionRecovery({
            vector: embedResponse.vectors[0] ?? [],
            topK: semanticLimit,
            sourceId,
            status: "active",
            embeddingDimension: embedResponse.dimensions,
            dateFrom: temporalRange?.dateFrom,
            dateTo: temporalRange?.dateTo,
          })) as RetrievalResult[];

          // Mark key as used
          if (embedKeyInfo.id !== -1) {
            await prisma.llmApiKey.update({
              where: { id: embedKeyInfo.id },
              data: { lastUsedAt: new Date() },
            });
          }

          embedSuccess = true;
        } catch (error: any) {
          const status = error?.status || error?.response?.status;
          const errMsg = error instanceof Error ? error.message : String(error);

          log("warn", "chat.embed.attempt_failed", {
            attempt: embedAttempt,
            apiKeyId: embedKeyInfo.id,
            status,
            message: errMsg,
          });

          // Handle 429: mark key limited and retry with next key
          if (status === 429 && embedKeyInfo.id !== -1) {
            const reason = this.detectLimitReason(error);
            await prisma.llmApiKey.update({
              where: { id: embedKeyInfo.id },
              data: {
                status: "limited",
                limitReason: reason,
                limitedAt: new Date(),
              },
            });
            continue; // Try next key
          }

          // Handle invalid key
          if ((status === 401 || status === 403) && embedKeyInfo.id !== -1) {
            await prisma.llmApiKey.update({
              where: { id: embedKeyInfo.id },
              data: {
                status: "invalid",
                invalidatedAt: new Date(),
              },
            });
            continue;
          }

          // Other errors: stop retrying
          break;
        }
      }
    }

    const fused = this.fuseByReciprocalRank(semanticResults, lexicalResults);
    const diversified = this.applyDocumentDiversityLimit(fused, topK, 2);

    return {
      results: diversified,
      semanticCount: semanticResults.length,
      lexicalCount: lexicalResults.length,
    };
  }

  private fuseByReciprocalRank(
    semanticResults: RetrievalResult[],
    lexicalResults: RetrievalResult[],
  ): RetrievalResult[] {
    const rrfK = 60;
    const scoreByKey = new Map<
      string,
      {
        score: number;
        result: RetrievalResult;
      }
    >();

    semanticResults.forEach((result, index) => {
      const key = this.getResultKey(result);
      const previous = scoreByKey.get(key);
      const addedScore = 1 / (rrfK + index + 1);
      if (previous) {
        previous.score += addedScore;
        return;
      }
      scoreByKey.set(key, {
        score: addedScore,
        result,
      });
    });

    lexicalResults.forEach((result, index) => {
      const key = this.getResultKey(result);
      const previous = scoreByKey.get(key);
      const addedScore = 1 / (rrfK + index + 1);
      if (previous) {
        previous.score += addedScore;
        if (!previous.result.payload.chunkId && result.payload.chunkId) {
          previous.result = result;
        }
        return;
      }
      scoreByKey.set(key, {
        score: addedScore,
        result,
      });
    });

    return Array.from(scoreByKey.values())
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.result.score - a.result.score;
      })
      .map((item) => item.result);
  }

  private applyDocumentDiversityLimit(
    results: RetrievalResult[],
    limit: number,
    perDocumentCap: number,
  ): RetrievalResult[] {
    if (results.length <= limit) {
      return results;
    }

    const picked: RetrievalResult[] = [];
    const pickedKeys = new Set<string>();
    const docCount = new Map<number, number>();

    for (const result of results) {
      const key = this.getResultKey(result);
      if (pickedKeys.has(key)) {
        continue;
      }

      const count = docCount.get(result.payload.documentId) ?? 0;
      if (count >= perDocumentCap) {
        continue;
      }

      picked.push(result);
      pickedKeys.add(key);
      docCount.set(result.payload.documentId, count + 1);

      if (picked.length >= limit) {
        return picked;
      }
    }

    for (const result of results) {
      const key = this.getResultKey(result);
      if (pickedKeys.has(key)) {
        continue;
      }
      picked.push(result);
      pickedKeys.add(key);
      if (picked.length >= limit) {
        break;
      }
    }

    return picked;
  }

  private getResultKey(result: RetrievalResult): string {
    return result.payload.chunkId ?? String(result.id);
  }

  private async searchWithCollectionRecovery(params: {
    vector: number[];
    topK: number;
    sourceId: number;
    status: "active" | "deleted";
    embeddingDimension: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<
    Array<{
      id: string | number;
      score: number;
      payload: {
        chunkId?: string;
        sourceId: number;
        documentId: number;
        notionPageId: string;
        chunkIndex: number;
        title: string;
        url: string;
        text: string;
        anchor?: string;
        lastEditedAt?: string;
        status: "active" | "deleted";
      };
    }>
  > {
    try {
      return await this.qdrant.search({
        vector: params.vector,
        topK: params.topK,
        sourceId: params.sourceId,
        status: params.status,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Qdrant search failed";
      const collectionMissing =
        message.includes("Qdrant request failed (404)") &&
        message.includes("doesn't exist");

      if (!collectionMissing) {
        throw error;
      }

      log("warn", "chat.qdrant.collection_missing", {
        sourceId: params.sourceId,
        message,
      });

      await this.qdrant.ensureCollection(params.embeddingDimension);
      await this.qdrant.ensurePayloadIndexes();

      return [];
    }
  }
}
