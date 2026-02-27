import http from "http";
import process from "process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { NotionClient } = require("@notion-wiki/notion-client");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createListPage(start, count) {
  return Array.from({ length: count }, (_, index) => {
    const id = `page-${start + index}`;
    return {
      id,
      url: `https://example.notion.site/${id}`,
      last_edited_time: new Date().toISOString(),
      archived: false,
      in_trash: false
    };
  });
}

async function main() {
  const state = {
    queryCalls: 0,
    searchCalls: 0,
    queryCursors: []
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/v1/data_sources/test-ds/query") {
      state.queryCalls += 1;
      const body = await readJson(req);
      state.queryCursors.push(body.start_cursor ?? null);

      if (body.page_size !== 100) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "page_size must be 100" }));
        return;
      }

      if (state.queryCalls === 1) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            results: createListPage(1, 100),
            next_cursor: "cursor-1",
            has_more: true
          })
        );
        return;
      }

      if (state.queryCalls === 2) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            results: createListPage(101, 100),
            next_cursor: "cursor-2",
            has_more: true
          })
        );
        return;
      }

      if (state.queryCalls === 3) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            results: createListPage(201, 5),
            next_cursor: null,
            has_more: false
          })
        );
        return;
      }

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "unexpected pagination call" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/search") {
      state.searchCalls += 1;
      if (state.searchCalls === 1) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "1"
        });
        res.end(JSON.stringify({ message: "rate limited" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          object: "list",
          results: [
            {
              id: "search-result-1",
              object: "page",
              url: "https://example.notion.site/search-result-1",
              last_edited_time: new Date().toISOString()
            }
          ],
          next_cursor: null,
          has_more: false
        })
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/users/me") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "user", id: "test-user" }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate test server port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const client = new NotionClient({
    token: "test-token",
    notionVersion: "2025-09-03",
    baseUrl,
    requestsPerSecond: 100
  });

  try {
    const pages = await client.listAllDataSourcePages("test-ds");
    assertCondition(pages.length === 205, `Expected 205 pages, got ${pages.length}`);
    assertCondition(state.queryCalls === 3, `Expected 3 query calls, got ${state.queryCalls}`);
    assertCondition(
      JSON.stringify(state.queryCursors) === JSON.stringify([null, "cursor-1", "cursor-2"]),
      `Unexpected query cursors: ${JSON.stringify(state.queryCursors)}`
    );

    const retryStartedAt = Date.now();
    const searchResult = await client.search();
    const retryElapsedMs = Date.now() - retryStartedAt;

    assertCondition(state.searchCalls === 2, `Expected 2 search calls, got ${state.searchCalls}`);
    assertCondition(
      retryElapsedMs >= 900,
      `Retry-After delay not respected enough (elapsed=${retryElapsedMs}ms)`
    );
    assertCondition(Array.isArray(searchResult.results), "search results should be array");
    assertCondition(searchResult.results.length === 1, "search should return one result after retry");

    console.log(
      `[notion-client-test] PASS ${JSON.stringify(
        {
          paginationPages: pages.length,
          queryCalls: state.queryCalls,
          searchCalls: state.searchCalls,
          retryElapsedMs
        },
        null,
        2
      )}`
    );
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(`[notion-client-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
