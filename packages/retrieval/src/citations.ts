import { Citation, citationSchema } from "@notion-wiki/contracts";

export interface CitationSourceChunk {
  chunkId: string;
  title: string;
  url: string;
  text: string;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function quoteFromChunk(chunkText: string, maxSentences: number = 2, maxChars: number = 280): string {
  const sentences = splitSentences(chunkText).slice(0, maxSentences);
  const quote = sentences.join(" ").trim();
  return quote.length > maxChars ? `${quote.slice(0, maxChars - 3)}...` : quote;
}

export function toCitation(chunk: CitationSourceChunk): Citation {
  return citationSchema.parse({
    chunkId: chunk.chunkId,
    title: chunk.title,
    url: chunk.url,
    quote: quoteFromChunk(chunk.text)
  });
}

export function validateCitations(citations: unknown[]): Citation[] {
  return citations.map((citation) => citationSchema.parse(citation));
}
