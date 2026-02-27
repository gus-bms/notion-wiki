# Worklog Feedback

## 2026-02-27

### Source
- Reviewed: `docs/feedback/2026-02-27T-codebase-review.md`

### Implemented fixes (this pass)

1. Security: encryption key separation
- File: `packages/db/src/crypto.ts`
- Changed key derivation to use `ENCRYPTION_KEY` first.
- Added guarded legacy fallback to `APP_TOKEN` for backward compatibility.
- Added decrypt fallback path for legacy ciphertext created with previous key source.

2. Security: timing-safe APP token comparison
- File: `apps/api/src/auth/auth.guard.ts`
- Replaced direct string comparison with `timingSafeEqual` buffer comparison.

3. Data correctness: remove stale vectors on reindex
- Files:
  - `apps/worker/src/worker.service.ts`
  - `packages/vector-store/src/qdrantClient.ts`
- Added Qdrant point deletion API (`deletePoints`).
- During chunk cleanup, stale chunk point IDs are collected and deleted from Qdrant before DB chunk deletion.

4. Retrieval coverage: expand block normalization
- File: `packages/retrieval/src/normalize.ts`
- Added support for additional Notion-like blocks:
  - `to_do`, `quote`, `callout`, `toggle`, `code`, `table_row`, `equation`, `divider`
- Added URL fallback extraction for blocks with URL payloads.

5. Security hardening: Gemini API key transport
- File: `packages/llm-provider/src/geminiProvider.ts`
- Removed API key from URL query string.
- Switched to `x-goog-api-key` request header for both embed and chat calls.
- Added `x-goog-request-id` fallback when collecting request IDs from error responses.

6. Environment docs update
- Files:
  - `.env.example`
  - `README.md`
- Added `ENCRYPTION_KEY` and note to avoid reusing `APP_TOKEN`.

### Validation run
- `npm run --workspace @notion-wiki/db build`
- `npm run --workspace @notion-wiki/vector-store build`
- `npm run --workspace @notion-wiki/retrieval build`
- `npm run --workspace @notion-wiki/llm-provider build`
- `npm run --workspace @notion-wiki/api build`
- `npm run --workspace @notion-wiki/worker build`
- `npm run --workspace @notion-wiki/web build`

All above commands passed.

### Not covered in this pass
- Test framework introduction (Vitest/Jest) and broad unit test expansion
- UI/Service modular refactor (`App.tsx`, `chat.service.ts`)
- Global exception filter
- Metrics/observability backlog items
