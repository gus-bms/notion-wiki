import process from "process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { prisma } = require("@notion-wiki/db");

function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const config = {
  apiBaseUrl: process.env.E2E_API_BASE_URL?.trim() || "http://localhost:3000",
  appToken: process.env.E2E_APP_TOKEN?.trim() || process.env.APP_TOKEN?.trim() || "",
  sourceId: toNumber(process.env.E2E_SOURCE_ID, 1),
  sessionId: process.env.E2E_SESSION_ID ? toNumber(process.env.E2E_SESSION_ID, 0) : null,
  runIngest: toBoolean(process.env.E2E_RUN_INGEST, false),
  ingestMode: process.env.E2E_INGEST_MODE === "full" ? "full" : "incremental",
  ingestPollMs: toNumber(process.env.E2E_INGEST_POLL_MS, 2000),
  ingestTimeoutMs: toNumber(process.env.E2E_INGEST_TIMEOUT_MS, 900000),
  allowEmptyCitations: toBoolean(process.env.E2E_ALLOW_EMPTY_CITATIONS, false),
  chatMessage: process.env.E2E_CHAT_MESSAGE?.trim() || ""
};

const warnings = [];

async function apiRequest(path, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.appToken}`,
    ...(init.headers ?? {})
  };

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${init.method || "GET"} ${path} returned non-JSON response`);
  }
}

async function waitForIngestJob(jobId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < config.ingestTimeoutMs) {
    const job = await apiRequest(`/ingest/jobs/${jobId}`);
    if (job.status === "succeeded") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(
        `Ingest job ${jobId} failed: ${job.errorCode || "unknown"} ${job.errorMessage || "no error message"}`
      );
    }
    await sleep(config.ingestPollMs);
  }

  throw new Error(`Ingest job ${jobId} timeout after ${config.ingestTimeoutMs}ms`);
}

async function validateCitationAgainstDb(citation) {
  assertCondition(typeof citation.chunkId === "string" && citation.chunkId.length > 0, "citation.chunkId is required");
  assertCondition(typeof citation.title === "string", "citation.title must be string");
  assertCondition(typeof citation.url === "string" && citation.url.length > 0, "citation.url is required");
  assertCondition(typeof citation.quote === "string" && citation.quote.length > 0, "citation.quote is required");

  const chunk = await prisma.documentChunk.findUnique({
    where: { chunkId: citation.chunkId },
    include: { document: true }
  });

  assertCondition(Boolean(chunk), `chunk not found for citation.chunkId=${citation.chunkId}`);

  const chunkText = normalizeText(chunk.chunkText);
  const quoteText = normalizeText(citation.quote);
  assertCondition(quoteText.length > 0, `citation.quote is empty after normalize for chunkId=${citation.chunkId}`);

  const containsExact = chunkText.includes(quoteText);
  if (!containsExact) {
    const quotePrefix = quoteText.slice(0, Math.min(80, quoteText.length));
    const containsPrefix = quotePrefix.length >= 20 && chunkText.includes(quotePrefix);
    assertCondition(
      containsPrefix,
      `citation.quote does not match chunk text for chunkId=${citation.chunkId}`
    );
    warnings.push(`Partial quote match used for chunkId=${citation.chunkId}`);
  }

  if (chunk.document?.url && citation.url !== chunk.document.url) {
    warnings.push(`citation.url differs from DB url for chunkId=${citation.chunkId}`);
  }
  if (chunk.document?.title && citation.title !== chunk.document.title) {
    warnings.push(`citation.title differs from DB title for chunkId=${citation.chunkId}`);
  }
}

async function main() {
  assertCondition(config.appToken.length > 0, "APP_TOKEN (or E2E_APP_TOKEN) is required");
  assertCondition(Number.isInteger(config.sourceId) && config.sourceId > 0, "E2E_SOURCE_ID must be a positive number");
  assertCondition(
    config.chatMessage.length > 0,
    "E2E_CHAT_MESSAGE is required. use an indexed phrase query, e.g. \"다음 문장이 있는 문서 찾아줘: forcura.com\""
  );

  console.log(`[e2e] API base: ${config.apiBaseUrl}`);
  console.log(`[e2e] Source ID: ${config.sourceId}`);

  await apiRequest("/health");
  console.log("[e2e] API health check passed");

  const targetResult = await apiRequest(`/sources/${config.sourceId}/targets`);
  const targets = Array.isArray(targetResult.targets) ? targetResult.targets : [];
  const activeTargets = targets.filter((target) => target.status === "active");
  assertCondition(activeTargets.length > 0, `No active targets found for sourceId=${config.sourceId}`);
  console.log(`[e2e] Active targets: ${activeTargets.length}`);

  let ingestJobId = null;
  if (config.runIngest) {
    const ingestResult = await apiRequest("/ingest/run", {
      method: "POST",
      body: JSON.stringify({
        sourceId: config.sourceId,
        mode: config.ingestMode
      })
    });
    ingestJobId = ingestResult.jobId;
    assertCondition(Number.isInteger(ingestJobId), "ingest/run did not return a valid jobId");
    console.log(`[e2e] Ingest queued: jobId=${ingestJobId}, mode=${config.ingestMode}`);
    const ingestJob = await waitForIngestJob(ingestJobId);
    if (ingestJob.errorCode || ingestJob.errorMessage) {
      warnings.push(
        `Ingest job succeeded with warnings: ${ingestJob.errorCode || "NO_CODE"} ${ingestJob.errorMessage || ""}`.trim()
      );
    }
    console.log(`[e2e] Ingest succeeded: jobId=${ingestJobId}`);
  } else {
    console.log("[e2e] Ingest step skipped (E2E_RUN_INGEST=false)");
  }

  const chatPayload = {
    sourceId: config.sourceId,
    message: config.chatMessage,
    ...(config.sessionId ? { sessionId: config.sessionId } : {})
  };
  const chatResult = await apiRequest("/chat", {
    method: "POST",
    body: JSON.stringify(chatPayload)
  });

  assertCondition(typeof chatResult.answer === "string", "chat.answer must be string");
  assertCondition(chatResult.answer.trim().length > 0, "chat.answer must not be empty");
  assertCondition(Array.isArray(chatResult.citations), "chat.citations must be array");
  assertCondition(
    chatResult.meta && Number.isFinite(chatResult.meta.retrievalMs) && Number.isFinite(chatResult.meta.llmMs),
    "chat.meta is invalid"
  );

  const citations = chatResult.citations;
  if (citations.length === 0) {
    assertCondition(
      config.allowEmptyCitations,
      "chat.citations is empty. set E2E_ALLOW_EMPTY_CITATIONS=1 to allow this case"
    );
    warnings.push("No citations returned by chat");
  } else {
    for (const citation of citations) {
      await validateCitationAgainstDb(citation);
    }
  }

  const summary = {
    ok: true,
    sourceId: config.sourceId,
    ingestJobId,
    sessionId: chatResult.sessionId,
    citations: citations.length,
    retrievalMs: chatResult.meta.retrievalMs,
    llmMs: chatResult.meta.llmMs,
    warnings
  };

  console.log(`[e2e] PASS ${JSON.stringify(summary, null, 2)}`);
}

main()
  .catch((error) => {
    console.error(`[e2e] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
