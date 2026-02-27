interface RichText {
  plain_text?: string;
}

interface NotionLikeBlock {
  type: string;
  [key: string]: unknown;
}

function richTextToPlain(richText: RichText[] | undefined): string {
  if (!richText || richText.length === 0) {
    return "";
  }
  return richText.map((item) => item.plain_text ?? "").join("");
}

export function normalizeBlocksToText(blocks: NotionLikeBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const blockData = block[block.type] as { rich_text?: RichText[]; text?: RichText[] } | undefined;
    const text = richTextToPlain(blockData?.rich_text ?? blockData?.text);
    if (!text) {
      continue;
    }

    if (block.type.startsWith("heading_")) {
      const level = Number.parseInt(block.type.replace("heading_", ""), 10);
      const hashes = "#".repeat(Number.isFinite(level) ? level : 1);
      lines.push(`${hashes} ${text}`);
      continue;
    }

    if (block.type === "bulleted_list_item") {
      lines.push(`- ${text}`);
      continue;
    }

    if (block.type === "numbered_list_item") {
      lines.push(`1. ${text}`);
      continue;
    }

    lines.push(text);
  }

  return lines.join("\n");
}
