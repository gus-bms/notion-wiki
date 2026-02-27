interface RichText {
  plain_text?: string;
}

interface NotionLikeBlock {
  type: string;
  [key: string]: unknown;
}

interface NotionLikeBlockData {
  rich_text?: RichText[];
  text?: RichText[];
  caption?: RichText[];
  checked?: boolean;
  language?: string;
  url?: string;
  expression?: string;
  cells?: RichText[][];
}

function richTextToPlain(richText: RichText[] | undefined): string {
  if (!richText || richText.length === 0) {
    return "";
  }
  return richText.map((item) => item.plain_text ?? "").join("");
}

function tableCellsToPlain(cells: RichText[][] | undefined): string {
  if (!cells || cells.length === 0) {
    return "";
  }

  return cells
    .map((cell) => richTextToPlain(cell).trim())
    .filter(Boolean)
    .join(" | ");
}

export function normalizeBlocksToText(blocks: NotionLikeBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.type === "divider") {
      lines.push("---");
      continue;
    }

    const blockData = block[block.type] as NotionLikeBlockData | undefined;
    const text = richTextToPlain(blockData?.rich_text ?? blockData?.text ?? blockData?.caption).trim();

    if (block.type.startsWith("heading_")) {
      if (!text) {
        continue;
      }
      const level = Number.parseInt(block.type.replace("heading_", ""), 10);
      const hashes = "#".repeat(Number.isFinite(level) ? level : 1);
      lines.push(`${hashes} ${text}`);
      continue;
    }

    if (block.type === "bulleted_list_item") {
      if (!text) {
        continue;
      }
      lines.push(`- ${text}`);
      continue;
    }

    if (block.type === "numbered_list_item") {
      if (!text) {
        continue;
      }
      lines.push(`1. ${text}`);
      continue;
    }

    if (block.type === "to_do") {
      if (!text) {
        continue;
      }
      lines.push(`- [${blockData?.checked ? "x" : " "}] ${text}`);
      continue;
    }

    if (block.type === "quote") {
      if (!text) {
        continue;
      }
      lines.push(`> ${text}`);
      continue;
    }

    if (block.type === "callout") {
      if (!text) {
        continue;
      }
      lines.push(`! ${text}`);
      continue;
    }

    if (block.type === "toggle") {
      if (!text) {
        continue;
      }
      lines.push(`[toggle] ${text}`);
      continue;
    }

    if (block.type === "code") {
      if (!text) {
        continue;
      }
      const language = typeof blockData?.language === "string" ? blockData.language : "";
      lines.push(language ? `\`\`\`${language}` : "```");
      lines.push(text);
      lines.push("```");
      continue;
    }

    if (block.type === "table_row") {
      const rowText = tableCellsToPlain(blockData?.cells);
      if (rowText) {
        lines.push(`| ${rowText} |`);
      }
      continue;
    }

    if (block.type === "equation") {
      const expression = typeof blockData?.expression === "string" ? blockData.expression.trim() : "";
      if (expression) {
        lines.push(`$${expression}$`);
      }
      continue;
    }

    const url = typeof blockData?.url === "string" ? blockData.url.trim() : "";
    if (text) {
      lines.push(text);
      continue;
    }
    if (url) {
      lines.push(url);
    }
  }

  return lines.join("\n");
}
