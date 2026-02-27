import { createHash } from "crypto";

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

export interface TextChunk {
  chunkIndex: number;
  chunkText: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  contentHash: string;
}

function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4));
}

export function chunkTextByTokenLength(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const targetTokens = options.targetTokens ?? 800;
  const overlapTokens = options.overlapTokens ?? 120;
  const sentences = text
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let current = "";
  let chunkStartOffset = 0;

  for (const sentence of sentences) {
    const candidate = current ? `${current}\n${sentence}` : sentence;
    if (estimateTokens(candidate) <= targetTokens || !current) {
      current = candidate;
      continue;
    }

    const start = text.indexOf(current, chunkStartOffset);
    const end = start + current.length;
    chunks.push({
      chunkIndex: chunks.length,
      chunkText: current,
      startOffset: start,
      endOffset: end,
      tokenCount: estimateTokens(current),
      contentHash: createHash("sha256").update(current).digest("hex")
    });

    const overlapText = current.split(/\s+/).slice(-overlapTokens).join(" ");
    current = overlapText ? `${overlapText}\n${sentence}` : sentence;
    chunkStartOffset = Math.max(0, end - overlapText.length);
  }

  if (current) {
    const start = text.indexOf(current, chunkStartOffset);
    const end = start + current.length;
    chunks.push({
      chunkIndex: chunks.length,
      chunkText: current,
      startOffset: start,
      endOffset: end,
      tokenCount: estimateTokens(current),
      contentHash: createHash("sha256").update(current).digest("hex")
    });
  }

  return chunks;
}

export function buildChunkId(params: {
  sourceId: number;
  notionPageId: string;
  chunkIndex: number;
  contentHash: string;
}): string {
  return `${params.sourceId}:${params.notionPageId}:${params.chunkIndex}:${params.contentHash.slice(0, 12)}`;
}
