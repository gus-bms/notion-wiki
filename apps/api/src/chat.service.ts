import { Injectable } from "@nestjs/common";
import { chatRequestSchema, Citation } from "@notion-wiki/contracts";
import { prisma } from "@notion-wiki/db";
import { GeminiProvider, MockProvider } from "@notion-wiki/llm-provider";
import { log } from "@notion-wiki/observability";
import { parseChatResponse, DEFAULT_SYSTEM_PROMPT } from "@notion-wiki/prompts";
import { toCitation, validateCitations } from "@notion-wiki/retrieval";
import { QdrantClient } from "@notion-wiki/vector-store";

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
  private readonly provider = process.env.GEMINI_API_KEY
    ? new GeminiProvider(process.env.GEMINI_API_KEY)
    : new MockProvider();

  private readonly qdrant = new QdrantClient({
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION ?? "notion_chunks"
  });

  async chat(input: unknown): Promise<{
    sessionId: number;
    answer: string;
    citations: Citation[];
    meta: { topK: number; retrievalMs: number; llmMs: number };
  }> {
    const parsed = chatRequestSchema.parse(input);
    const topK = 8;

    const session =
      parsed.sessionId !== undefined
        ? await prisma.chatSession.findUnique({ where: { id: parsed.sessionId } })
        : await prisma.chatSession.create({ data: { sourceId: parsed.sourceId } });

    const activeSession =
      session ??
      (await prisma.chatSession.create({
        data: { sourceId: parsed.sourceId }
      }));

    await prisma.chatMessage.create({
      data: {
        sessionId: activeSession.id,
        role: "user",
        messageText: parsed.message
      }
    });

    const retrievalStartedAt = Date.now();
    let retrievalResults: RetrievalResult[] = [];
    let semanticCandidateCount = 0;
    let lexicalCandidateCount = 0;
    let hybridEnabled = false;

    const lexicalCandidate = this.extractLexicalCandidate(parsed.message);
    const exactLookupRequested = lexicalCandidate !== null;
    let partialLexicalUsed = false;

    if (lexicalCandidate) {
      retrievalResults = await this.findLexicalMatches(parsed.sourceId, lexicalCandidate, topK);
      if (retrievalResults.length === 0 && exactLookupRequested) {
        retrievalResults = await this.findPartialLexicalMatches(parsed.sourceId, lexicalCandidate, topK);
        partialLexicalUsed = retrievalResults.length > 0;
      }
    }

    if (!exactLookupRequested) {
      const hybrid = await this.retrieveHybridResults(parsed.sourceId, parsed.message, topK);
      retrievalResults = hybrid.results;
      semanticCandidateCount = hybrid.semanticCount;
      lexicalCandidateCount = hybrid.lexicalCount;
      hybridEnabled = true;
    }

    const retrievalMs = Date.now() - retrievalStartedAt;

    const contexts = retrievalResults.map((result) => ({
      chunkId: result.payload.chunkId ?? String(result.id),
      title: result.payload.title,
      url: result.payload.url,
      text: result.payload.text
    }));

    let answer = "Cannot verify";
    let citations: Citation[] = [];
    let llmMs = 0;

    if (exactLookupRequested && contexts.length === 0) {
      answer = "Exact phrase was not found in indexed documents for this source.";
    } else if (exactLookupRequested && contexts.length > 0) {
      citations = contexts.slice(0, 5).map((context) => toCitation(context));
      answer = partialLexicalUsed
        ? `Exact phrase was not found, but found ${contexts.length} partial match(es).`
        : `Found ${contexts.length} exact match(es).`;
    } else if (contexts.length > 0) {
      const llmStartedAt = Date.now();
      try {
        const rawResponse = await this.provider.chat({
          model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash",
          outputFormat: "json",
          systemInstruction: DEFAULT_SYSTEM_PROMPT,
          userMessage: parsed.message,
          contexts
        });
        llmMs = Date.now() - llmStartedAt;

        const parsedResponse = parseChatResponse(rawResponse.text);
        answer = parsedResponse.answer || "Cannot verify";

        try {
          citations = validateCitations(parsedResponse.citations);
        } catch {
          citations = [];
        }
      } catch (error) {
        llmMs = Date.now() - llmStartedAt;
        const message = error instanceof Error ? error.message : "LLM generation failed";
        log("warn", "chat.llm.failed", {
          sourceId: parsed.sourceId,
          sessionId: activeSession.id,
          message
        });
        answer = "LLM generation failed. Review the citations below.";
        citations = [toCitation(contexts[0])];
      }
    } else {
      answer = "Cannot verify: no relevant evidence found.";
    }

    if (contexts.length > 0 && citations.length === 0) {
      citations = [toCitation(contexts[0])];
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: activeSession.id,
        role: "assistant",
        messageText: parsed.message,
        answerText: answer,
        citationsJson: citations,
        metaJson: { topK, retrievalMs, llmMs }
      }
    });

    await prisma.retrievalLog.create({
      data: {
        messageId: assistantMessage.id,
        queryText: parsed.message,
        topK,
        chunkIdsJson: retrievalResults.map((item) => String(item.id)),
        scoresJson: retrievalResults.map((item) => item.score),
        contextTokensEst: contexts.reduce((acc, cur) => acc + Math.ceil(cur.text.length / 4), 0),
        retrievalMs,
        llmMs,
        cacheHit: false
      }
    });

    log("info", "chat.completed", {
      sourceId: parsed.sourceId,
      sessionId: activeSession.id,
      topK,
      retrievalMs,
      llmMs,
      citationCount: citations.length,
      lexicalCandidate: lexicalCandidate ?? null,
      usedLexical: exactLookupRequested ? retrievalResults.length > 0 : lexicalCandidateCount > 0,
      exactLookupRequested,
      partialLexicalUsed,
      hybridEnabled,
      semanticCandidateCount,
      lexicalCandidateCount
    });

    return {
      sessionId: activeSession.id,
      answer,
      citations,
      meta: { topK, retrievalMs, llmMs }
    };
  }

  private extractLexicalCandidate(message: string): string | null {
    const trimmed = message.trim();
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

    const colonMatch = trimmed.match(/[:：]\s*(.+)$/);
    if (colonMatch?.[1]) {
      const candidate = colonMatch[1].trim();
      if (candidate.length >= 8) {
        return candidate;
      }
    }

    return null;
  }

  private async findLexicalMatches(sourceId: number, query: string, limit: number): Promise<RetrievalResult[]> {
    const chunks = await prisma.documentChunk.findMany({
      where: {
        chunkText: {
          contains: query
        },
        document: {
          sourceId,
          status: "active"
        }
      },
      include: {
        document: {
          select: {
            id: true,
            sourceId: true,
            notionPageId: true,
            title: true,
            url: true,
            status: true
          }
        }
      },
      orderBy: {
        id: "desc"
      },
      take: limit
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
        status: chunk.document.status === "active" ? "active" : "deleted"
      }
    }));
  }

  private async findPartialLexicalMatches(sourceId: number, query: string, limit: number): Promise<RetrievalResult[]> {
    const tokens = this.extractSearchTokens(query);
    if (tokens.length === 0) {
      return [];
    }

    const candidates = await prisma.documentChunk.findMany({
      where: {
        document: {
          sourceId,
          status: "active"
        },
        OR: tokens.map((token) => ({
          chunkText: {
            contains: token
          }
        }))
      },
      include: {
        document: {
          select: {
            id: true,
            sourceId: true,
            notionPageId: true,
            title: true,
            url: true,
            status: true
          }
        }
      },
      orderBy: {
        id: "desc"
      },
      take: 100
    });

    const scored = candidates
      .map((chunk) => {
        const hitCount = tokens.reduce((count, token) => (chunk.chunkText.includes(token) ? count + 1 : count), 0);
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
        status: item.chunk.document.status === "active" ? "active" : "deleted"
      }
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

  private async retrieveHybridResults(sourceId: number, message: string, topK: number): Promise<HybridRetrievalOutput> {
    const semanticLimit = Math.max(topK * 4, 24);
    const lexicalLimit = Math.max(topK * 6, 48);

    const lexicalResults = await this.findPartialLexicalMatches(sourceId, message, lexicalLimit);

    let semanticResults: RetrievalResult[] = [];
    try {
      const embedResponse = await this.provider.embed({
        texts: [message],
        model: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
        taskType: "retrieval_query"
      });

      semanticResults = (await this.searchWithCollectionRecovery({
        vector: embedResponse.vectors[0] ?? [],
        topK: semanticLimit,
        sourceId,
        status: "active",
        embeddingDimension: embedResponse.dimensions
      })) as RetrievalResult[];
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Hybrid semantic retrieval failed";
      log("warn", "chat.hybrid.semantic_failed", {
        sourceId,
        message: messageText
      });
    }

    const fused = this.fuseByReciprocalRank(semanticResults, lexicalResults);
    const diversified = this.applyDocumentDiversityLimit(fused, topK, 2);

    return {
      results: diversified,
      semanticCount: semanticResults.length,
      lexicalCount: lexicalResults.length
    };
  }

  private fuseByReciprocalRank(semanticResults: RetrievalResult[], lexicalResults: RetrievalResult[]): RetrievalResult[] {
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
        result
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
        result
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

  private applyDocumentDiversityLimit(results: RetrievalResult[], limit: number, perDocumentCap: number): RetrievalResult[] {
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
        status: params.status
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Qdrant search failed";
      const collectionMissing =
        message.includes("Qdrant request failed (404)") &&
        message.includes("doesn't exist");

      if (!collectionMissing) {
        throw error;
      }

      log("warn", "chat.qdrant.collection_missing", {
        sourceId: params.sourceId,
        message
      });

      await this.qdrant.ensureCollection(params.embeddingDimension);
      await this.qdrant.ensurePayloadIndexes();

      return [];
    }
  }
}
