# AGENTS.md — Notion Document Findability Tool (No Notion Add-on Cost)

## Project Context (STAR)

### Situation

- Team knowledge is scattered across Notion pages/databases.
- Classification/tagging is inconsistent → low findability and high time-to-answer.
- We do NOT want to pay for additional Notion search/AI add-ons.

### Task

- Build an internal AI-assisted search tool that makes Notion content easy to find
  **without additional Notion cost**.
- Prioritize **findability** over “perfect Notion re-organization.”

### Action (Core Approach)

- Keep Notion as the source of truth.
- Build an external **shadow index**:
  - ingest Notion pages/blocks → normalize text → chunk
  - store metadata + chunks
  - search via semantic retrieval (optionally hybrid with keyword)
  - generate answers with citations (page title + URL + chunk snippet)
- Improve lack of classification using **LLM-generated metadata**:
  - inferredDocType / inferredDomain / keywords / summary
- Start with a small scope (team-critical pages), then expand based on usage logs.

### Result (Target Outcomes)

- Reduce time spent searching; reduce repeated questions.
- Improve access to reliable source links.
- Provide an extensible foundation: ingestion, index, retrieval API, evaluation loop.

---

## Non-Negotiables / Constraints

1. **No additional Notion paid add-ons**
   - Do not depend on Notion Enterprise Search / Notion AI features.
   - Use only Notion API + our own infra.

2. **Security & Permission Boundaries**
   - Respect Notion access controls:
     - only ingest content the integration has access to
   - Do not attempt to bypass permission models.
   - Avoid exporting sensitive content outside allowed storage boundaries.

3. **Truthfulness**
   - Answers must include **citations** (Notion page URL + relevant excerpt).
   - If retrieval confidence is low, say so and show top matches rather than hallucinating.

4. **Scope Control**
   - MVP is “find + cite”; not “autonomous agent.”
   - Do not introduce complex workflow/agentic features unless explicitly requested.

---

## What This Repo Builds (MVP Definition)

### User-facing behavior

- Search query → return:
  - top relevant Notion documents/chunks
  - optional synthesized answer
  - citations (page title + URL + chunk context)

### System components

- Ingestion:
  - Notion API → page metadata + block content (recursive where needed)
  - incremental sync (lastEditedTime-based)
- Processing:
  - normalize to text
  - chunking strategy
  - metadata enrichment (optional; can be delayed until after MVP)
- Storage:
  - document store for raw text + metadata
  - vector index for semantic retrieval
  - optional keyword index for hybrid search
- Serving:
  - search API endpoint(s)
  - answer API endpoint(s) that always provide citations
- Ops:
  - basic logs + ingestion status
  - failure retries with clear error reporting

---

## Architecture Guidelines

### Data model (recommended fields)

- pageId, title, url
- lastEditedTime
- parent/ancestor context (if available)
- rawText (normalized)
- chunks[]:
  - chunkId, chunkText, startOffset/endOffset (or logical position)
  - embedding (stored in vector store)
  - chunkMetadata (pageId, title, url, etc.)
- inferred metadata (optional / post-MVP):
  - inferredDocType, inferredDomain, keywords, summary, importance

### Retrieval behavior (quality-first defaults)

- Always show top matches + citations.
- Prefer hybrid retrieval when keyword searches are important (team acronyms, IDs, error codes).
- Add reranking only when there is a clear retrieval-quality problem.

### Ingestion behavior

- Prefer incremental updates:
  - re-ingest if lastEditedTime changed
- Handle Notion block trees:
  - treat nested blocks as structured text, not lost content
- Keep ingestion idempotent:
  - same page version should not create duplicate chunks

---

## Workflow Rules (for AI Agents)

### Task classification

- Trivial: small text change, docs update, tiny fix with obvious blast radius.
- Non-trivial: ingestion logic, indexing, API behavior, schema changes, auth, deployment.

If non-trivial, follow the full workflow below.

### Required workflow for non-trivial work

1. **Research**
   - Inspect current ingestion/index/query flow
   - Create/Update: `docs/ai/research.md`
   - Include: current behavior, relevant files, risks, edge cases

2. **Plan**
   - Create/Update: `docs/ai/plan.md`
   - Include:
     - goals + non-goals
     - file-by-file changes
     - data model changes
     - test/validation plan
     - rollback notes (if relevant)
   - Do NOT implement in this phase.

3. **Review Cycle**
   - Wait for approval/comments.
   - Apply feedback to plan, then proceed.

4. **Implement**
   - Implement exactly what’s in the approved plan.
   - No scope creep.

5. **Validate**
   - Run checks relevant to the repo (lint/test/build)
   - Report what was run and what was not.

### Output rules

- No inflated claims or invented metrics.
- Prefer concrete, verifiable statements.
- If unsure, state assumptions explicitly.

---

## Directory Conventions

Recommended (adjust to actual repo structure):

- `apps/api/` or `src/api/` — search/answer endpoints
- `src/ingest/` — Notion ingestion + sync jobs
- `src/index/` — chunking + embedding + vector store integration
- `src/retrieval/` — retriever logic, ranking, filters
- `src/prompts/` — prompt templates (if any)
- `docs/ai/` — research/plan docs
- `docs/specs/` — product + architecture notes

---

## Coding Standards

- Follow existing repo conventions first.
- Prefer camelCase for variables/functions unless the repo says otherwise.
- Avoid new abstractions unless they reduce complexity.
- Keep changes reviewable; avoid formatting-only churn.

---

## Definition of Done (MVP)

A change is “done” when:

- Ingestion can pull target Notion pages and extract meaningful text.
- Index is built/updated incrementally without duplicates.
- Search returns relevant results with:
  - page title + URL
  - excerpts/citations
- If answer synthesis exists, it never omits citations and never invents sources.
- Basic validations pass (or missing validations are explicitly documented).

---

## Open Questions (must be decided explicitly; do not assume)

- Vector store choice (SQLite/pgvector/OpenSearch/etc.)
- Deployment model (cron job, worker, serverless)
- Scope of ingestion (seed pages vs databases vs workspace-wide)
- Data retention + access policy (where indexed content is stored)

Do not lock these choices in code without approval.
