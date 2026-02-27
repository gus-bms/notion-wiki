import { withRetry } from "./retry";
import { NotionBlock, NotionClientOptions, NotionListResponse, NotionPageSummary, NotionSearchEntry } from "./types";

export class NotionClientError extends Error {
  code:
    | "AUTH_FAILED"
    | "RATE_LIMITED"
    | "BAD_REQUEST"
    | "SERVER_ERROR"
    | "UPSTREAM_UNAVAILABLE"
    | "UNKNOWN";
  status?: number;
  retryable: boolean;
  retryAfter?: string;

  constructor(
    message: string,
    options: {
      code: NotionClientError["code"];
      retryable: boolean;
      status?: number;
      retryAfter?: string;
    }
  ) {
    super(message);
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
}

export class NotionClient {
  private readonly token: string;
  private readonly notionVersion: string;
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly maxRetries = 3;
  private nextAvailableAt: number = Date.now();

  constructor(options: NotionClientOptions) {
    this.token = options.token;
    this.notionVersion = options.notionVersion;
    this.baseUrl = options.baseUrl ?? "https://api.notion.com/v1";
    const rps = options.requestsPerSecond ?? 3;
    this.minIntervalMs = Math.max(1, Math.ceil(1000 / rps));
  }

  async validateToken(): Promise<void> {
    await this.request("/users/me");
  }

  async queryDataSource(targetId: string, cursor?: string): Promise<NotionListResponse<NotionPageSummary>> {
    return this.request(`/data_sources/${targetId}/query`, {
      method: "POST",
      body: {
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {})
      }
    });
  }

  async search(cursor?: string): Promise<NotionListResponse<NotionSearchEntry>> {
    return this.request("/search", {
      method: "POST",
      body: {
        page_size: 100,
        sort: {
          direction: "descending",
          timestamp: "last_edited_time"
        },
        ...(cursor ? { start_cursor: cursor } : {})
      }
    });
  }

  async retrievePage(pageId: string): Promise<unknown> {
    return this.request(`/pages/${pageId}`);
  }

  async listBlockChildren(blockId: string, cursor?: string): Promise<NotionListResponse<NotionBlock>> {
    const query = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : "?page_size=100";
    return this.request(`/blocks/${blockId}/children${query}`);
  }

  async listAllDataSourcePages(targetId: string): Promise<NotionPageSummary[]> {
    const pages: NotionPageSummary[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.queryDataSource(targetId, cursor);
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
    return pages;
  }

  async listAllSearchResults(): Promise<NotionSearchEntry[]> {
    const results: NotionSearchEntry[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.search(cursor);
      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return results;
  }

  async listAllBlocksRecursive(blockId: string): Promise<NotionBlock[]> {
    const all: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.listBlockChildren(blockId, cursor);
      for (const block of response.results) {
        all.push(block);
        if (block.has_children) {
          try {
            const nested = await this.listAllBlocksRecursive(block.id);
            all.push(...nested);
          } catch (error) {
            if (this.isUnsupportedBlockTypeError(error)) {
              continue;
            }
            throw error;
          }
        }
      }
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
    return all;
  }

  private async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    await this.waitForTurn();
    return withRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: options.method ?? "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Notion-Version": this.notionVersion,
            "Content-Type": "application/json"
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
          const bodyText = await response.text();
          const retryAfter = response.headers.get("Retry-After") ?? undefined;

          if (response.status === 401 || response.status === 403) {
            throw new NotionClientError(bodyText || "Notion authorization failed", {
              code: "AUTH_FAILED",
              status: response.status,
              retryable: false
            });
          }

          if (response.status === 429) {
            throw new NotionClientError(bodyText || "Notion rate limited", {
              code: "RATE_LIMITED",
              status: response.status,
              retryable: true,
              retryAfter
            });
          }

          if (response.status >= 500) {
            throw new NotionClientError(bodyText || "Notion server error", {
              code: "SERVER_ERROR",
              status: response.status,
              retryable: true
            });
          }

          throw new NotionClientError(bodyText || "Notion request failed", {
            code: "BAD_REQUEST",
            status: response.status,
            retryable: false
          });
        }

        return (await response.json()) as T;
      },
      {
        maxRetries: this.maxRetries
      }
    );
  }

  private async waitForTurn(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAvailableAt - now);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.nextAvailableAt = Math.max(this.nextAvailableAt, Date.now()) + this.minIntervalMs;
  }

  private isUnsupportedBlockTypeError(error: unknown): boolean {
    if (!(error instanceof NotionClientError)) {
      return false;
    }
    if (error.code !== "BAD_REQUEST") {
      return false;
    }
    return error.message.includes("not supported via the API for your bot type");
  }
}
