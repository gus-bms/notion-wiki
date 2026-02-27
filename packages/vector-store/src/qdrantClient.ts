export interface QdrantClientOptions {
  url: string;
  apiKey?: string;
  collection: string;
}

export interface QdrantPointPayload {
  chunkId: string;
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
}

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: QdrantPointPayload;
}

export class QdrantClient {
  private readonly url: string;
  private readonly apiKey?: string;
  private readonly collection: string;

  constructor(options: QdrantClientOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.collection = options.collection;
  }

  async ensureCollection(dimension: number): Promise<void> {
    try {
      await this.request(`/collections/${this.collection}`, {
        method: "PUT",
        body: {
          vectors: {
            size: dimension,
            distance: "Cosine"
          }
        }
      });
    } catch (error) {
      if (this.isAlreadyExistsError(error)) {
        return;
      }
      throw error;
    }
  }

  async ensurePayloadIndexes(): Promise<void> {
    const fields: Array<{ name: string; schema: string }> = [
      { name: "sourceId", schema: "integer" },
      { name: "status", schema: "keyword" },
      { name: "documentId", schema: "integer" },
      { name: "lastEditedAt", schema: "datetime" }
    ];

    await Promise.all(
      fields.map(async (field) => {
        try {
          await this.request(`/collections/${this.collection}/index`, {
            method: "PUT",
            body: {
              field_name: field.name,
              field_schema: field.schema
            }
          });
        } catch (error) {
          if (this.isAlreadyExistsError(error)) {
            return;
          }
          throw error;
        }
      })
    );
  }

  async upsert(points: QdrantPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    await this.request(`/collections/${this.collection}/points`, {
      method: "PUT",
      body: { points }
    });
  }

  async search(params: {
    vector: number[];
    topK: number;
    sourceId: number;
    status?: "active" | "deleted";
  }): Promise<
    Array<{
      id: string | number;
      score: number;
      payload: QdrantPointPayload;
    }>
  > {
    const response = await this.request<{
      result: Array<{ id: string | number; score: number; payload: QdrantPointPayload }>;
    }>(
      `/collections/${this.collection}/points/search`,
      {
        method: "POST",
        body: {
          vector: params.vector,
          limit: params.topK,
          with_payload: true,
          filter: {
            must: [
              { key: "sourceId", match: { value: params.sourceId } },
              { key: "status", match: { value: params.status ?? "active" } }
            ]
          }
        }
      }
    );

    return response.result ?? [];
  }

  async markDocumentDeleted(documentId: number): Promise<void> {
    await this.request(`/collections/${this.collection}/points/delete`, {
      method: "POST",
      body: {
        filter: {
          must: [{ key: "documentId", match: { value: documentId } }]
        }
      }
    });
  }

  private async request<T = unknown>(
    path: string,
    options: { method: "PUT" | "POST" | "GET"; body?: unknown }
  ): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Qdrant request failed (${response.status}): ${bodyText}`);
    }

    return (await response.json()) as T;
  }

  private isAlreadyExistsError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.includes("Qdrant request failed (409)") && error.message.includes("already exists");
  }
}
