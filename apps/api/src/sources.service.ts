import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createSourceSchema } from "@notion-wiki/contracts";
import { decryptSecret, encryptSecret, prisma } from "@notion-wiki/db";
import { NotionClient, NotionClientError } from "@notion-wiki/notion-client";

@Injectable()
export class SourcesService {
  async createSource(input: unknown): Promise<{ sourceId: number }> {
    const parsed = createSourceSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    await this.validateNotionCredentials(parsed.data.notionIntegrationToken, parsed.data.notionApiVersion);

    const source = await prisma.source.create({
      data: {
        name: parsed.data.name,
        notionTokenEnc: encryptSecret(parsed.data.notionIntegrationToken),
        notionApiVersion: parsed.data.notionApiVersion,
        provider: "notion",
        status: "active"
      }
    });

    return { sourceId: source.id };
  }

  async updateSourceCredentials(input: {
    sourceId: number;
    notionIntegrationToken: string;
    notionApiVersion: string;
    name?: string;
  }): Promise<{ sourceId: number }> {
    const source = await this.getSourceOrThrow(input.sourceId);
    await this.validateNotionCredentials(input.notionIntegrationToken, input.notionApiVersion);

    await prisma.source.update({
      where: { id: source.id },
      data: {
        name: input.name ?? source.name,
        notionTokenEnc: encryptSecret(input.notionIntegrationToken),
        notionApiVersion: input.notionApiVersion,
        status: "active"
      }
    });

    return { sourceId: source.id };
  }

  async getDefaultActiveSource() {
    return prisma.source.findFirst({
      where: { provider: "notion", status: "active" },
      orderBy: { id: "desc" }
    });
  }

  async testConnection(sourceId: number): Promise<{ ok: true; sourceId: number }> {
    const source = await this.getSourceOrThrow(sourceId);
    await this.validateNotionCredentials(decryptSecret(source.notionTokenEnc), source.notionApiVersion);

    return { ok: true, sourceId };
  }

  async getSourceOrThrow(sourceId: number) {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      throw new NotFoundException(`Source not found: ${sourceId}`);
    }
    return source;
  }

  private createNotionClient(token: string, notionVersion: string): NotionClient {
    return new NotionClient({
      token,
      notionVersion,
      requestsPerSecond: Number(process.env.NOTION_REQUESTS_PER_SECOND ?? 3)
    });
  }

  private async validateNotionCredentials(token: string, notionVersion: string): Promise<void> {
    const notionClient = this.createNotionClient(token, notionVersion);

    try {
      await notionClient.validateToken();
    } catch (error) {
      if (error instanceof NotionClientError && error.code === "AUTH_FAILED") {
        throw new BadRequestException("Notion token is invalid or permission is denied.");
      }
      throw error;
    }
  }
}
