export interface NotionClientOptions {
  token: string;
  notionVersion: string;
  requestsPerSecond?: number;
  baseUrl?: string;
}

export interface NotionListResponse<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionPageSummary {
  id: string;
  url: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
}

export interface NotionSearchEntry {
  id: string;
  object: "page" | "data_source" | "database" | string;
  url?: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  parent?: {
    type?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}
