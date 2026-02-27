# notion-wiki Research Notes (2026-02-26)

## 1) 조사 범위
- [Requirements.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/Requirements.md)
- [docs/requirements/functional.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/functional.md)
- [docs/requirements/nonFunctional.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/nonFunctional.md)
- [docs/requirements/dataModelAndApi.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/dataModelAndApi.md)
- [docs/requirements/pipelines.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/pipelines.md)
- [docs/requirements/testingAndRelease.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/testingAndRelease.md)
- [docs/requirements/llmProviderContract.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/docs/requirements/llmProviderContract.md)
- [AGENTS.md](C:/Users/harvey/Documents/Github/gusbms/notion-wiki/AGENTS.md)

## 2) 현재 상태
- 현재 저장소는 요구사항 문서 중심 상태이며, 구현 코드(`apps/*`, `packages/*`)는 아직 없다.
- 따라서 계획 수립 단계에서는 "구현 순서/모듈 경계/스키마/API/큐 설계"를 먼저 고정하고, 이후 스캐폴딩을 진행하는 것이 합리적이다.

## 3) 요구사항 핵심 정리 (P0 중심)
- Source/Target 등록 및 allowlist 기반 인덱싱 (FR-SRC, FR-TGT)
- Full/Incremental 인덱싱 + Notion pagination + rate limit/Retry-After 준수 (FR-ING-001~004)
- 비동기 인덱싱(Worker + Queue) (NFR-REL-001)
- RAG Q&A + citations 강제 `{chunkId,title,url,quote}` (FR-CHAT-001~002)
- Admin에서 인덱싱 상태/로그 조회 + 실행/재시도 (FR-ADM-001~002)
- 관측 로그(왜 이 답이 나왔는지 재구성 가능) (FR-OBS-001)

## 4) 시스템 경계 관찰
- API 서버(NestJS)는 동기 HTTP와 인증, 잡 enqueue, 조회를 담당.
- Worker(NestJS 또는 Node worker)는 Notion 수집/정규화/청킹/임베딩/Qdrant upsert를 담당.
- Web(React)은 Admin + Chat UI를 담당.
- 공통 패키지에서 도메인 타입/계약/프롬프트/클라이언트를 공유해야 drift가 줄어든다.

## 5) 주요 리스크 및 엣지 케이스
1. Notion pagination 누락
- page 목록과 block children 모두 `has_more/next_cursor`를 반복해야 하며, 둘 중 하나라도 누락 시 부분 인덱싱 위험이 크다.

2. Notion rate limit (평균 3 req/s, 429 + Retry-After)
- 글로벌 동시성 제어 없이 문서 단위 병렬화만 하면 429 폭증 가능.
- Worker 단에서 limiter를 공통 적용해야 한다.

3. 증분 동기화 정확도
- `last_edited_time`만으로는 누락 위험이 있어 contentHash 비교를 병행해야 안전하다.
- 동기화 경계 시각 처리(타임존/밀리초 truncation) 오류 가능성이 있다.

4. Qdrant payload/index 미설계
- 필터 필드가 payload에 없거나 index가 없으면 검색 지연과 비용이 증가한다.
- `sourceId/status/documentId/lastEditedAt`는 초기부터 payload + payload index를 넣어야 한다.

5. idempotency 부재
- 재시도 시 중복 chunk/point가 쌓이면 검색 품질 저하 및 비용 증가.
- `chunkId`를 결정적으로 생성하고 upsert 정책을 고정해야 한다.

6. Citation 강제 실패
- 모델 출력 파싱 실패 또는 quote 추출 실패 시 citation 누락 가능.
- "답변 실패 대신 확인 불가 + 빈 citations"로 안전하게 degrade해야 한다.

7. 보안/프라이버시
- Notion/Gemini 키는 서버 보관, 프론트 노출 금지.
- Gemini 전송 payload를 최소화하지 않으면 NFR-PRIV 위반.

## 6) 구현 전 가정
- 벡터스토어는 Qdrant, 큐/캐시는 Redis, RDB는 MySQL을 사용한다.
- 모노레포 빌드는 pnpm workspace + Turborepo 기준으로 제안한다.
- ORM은 Prisma 기준으로 제안하되, TypeORM 대체 가능성을 열어둔다.

## 2026-02-26 Addendum - Auto Target Discovery
- Gap identified: manual target ID entry caused setup friction and blocked practical onboarding.
- Decision: add discovery from Notion `/search` scoped to the source token permissions.
- Scope: include `data_source` plus top-level `page` targets; skip pages directly under a data source/database to reduce duplicate ingest work.
- Risk: very large workspaces may return many results; mitigated by pagination + dedupe + bulk create.

## 2026-02-27 Addendum - E2E Practicality
- Current repo has no dedicated test runner setup (Jest/Vitest/Playwright) for app-level E2E.
- Practical path for `M2-14`: runnable Node-based smoke script that validates API contract and DB-level citation provenance.
- Runtime constraint observed: ingest-included flow can exceed 10 minutes in real data conditions, so the script keeps ingest optional and validates chat+citation deterministically with lexical phrase queries.
- Follow-up result: ingest-included run completed successfully in a later attempt (with partial-failure warning), confirming the script should expose warning metadata instead of only pass/fail.

## 2026-02-27 Addendum - UX Pivot Request (Internal MVP)

### User feedback (direct request)
- Current UI feels old and workflow-heavy for internal daily usage.
- Main page should be chat-first; remove heavy admin controls from the primary surface.
- Notion setup should be auto-loaded from DB; if missing, show token login/setup screen.
- `Access` and `Ingest jobs` panels are confusing on the main path.
- Errors/notices should use toast notifications, not static bottom text.
- Preferred visual direction: modern styles from The Frontend Company UI trends page.
  - https://www.thefrontendcompany.com/posts/ui-trends

### Current behavior relevant to this request
- Web app currently exposes operator console controls directly in main UI:
  - APP token, sourceId, sessionId, ingest controls, jobs table.
  - File: `apps/web/src/App.tsx`
- Error/notice rendering is static text at bottom:
  - File: `apps/web/src/App.tsx`, `apps/web/src/styles.css`
- Source token is already persisted in DB as encrypted field (`sources.notion_token_enc`):
  - File: `packages/db/prisma/schema.prisma`
  - Service: `apps/api/src/sources.service.ts`
- API currently has no "bootstrap current workspace state" endpoint for chat-first load.
- API guard requires `Authorization` for most endpoints, creating client-side setup friction:
  - File: `apps/api/src/auth/auth.guard.ts`

### UX gaps identified
1. First impression overload
- Main screen mixes setup/admin/recovery and everyday chat actions.
- Users who only need "ask and cite" must understand source/target/job concepts first.

2. No persistence-first entry path
- Although Notion token is stored in DB, UI does not auto-resolve current source on load.
- Users repeatedly manage IDs/token flow in UI.

3. Feedback visibility is weak
- Bottom-anchored notice/error text is easy to miss after scrolling.

4. Style mismatch with requested direction
- Existing UI is functional but still resembles an internal operator panel.
- Request points to a more contemporary, streamlined search/chat-first style.

### Risks and edge cases
1. Multiple sources in DB
- Chat-first UX needs deterministic "active source" selection policy.

2. Missing targets or no indexed docs
- If source exists but retrieval is not ready, app must present guided recovery without returning to old admin-heavy layout.

3. Stored token becomes invalid
- Bootstrap can succeed for source lookup but fail for ingest/discovery; UI needs a clear re-login/reconnect path.

4. Auth mode mismatch
- Internal-only simplification may conflict with current APP token guard expectations.
- Need explicit decision: keep guard and hide token input, or allow controlled public bootstrap/login paths.

5. Toast spam and accessibility
- Repeated polling/refresh can generate noisy toasts; dedupe, severity, and auto-dismiss behavior must be defined.

## 2026-02-27 Addendum - Retrieval Quality Without Embedding Model Change

### Decision
- Keep current embedding model (`gemini-embedding-001`) and improve retrieval quality in pipeline logic.

### Why model switch is blocked now
- Current configured Gemini key/model listing exposes `models/gemini-embedding-001` only for embedding.
- Candidate alternatives tested from this runtime returned 404 (model not found) for this project/key context.
- Immediate quality gain should come from retrieval strategy, not model swap.

### Current retrieval gap
1. Non-exact queries are semantic-only path
- Chat currently uses lexical retrieval only for exact-lookup style inputs (quotes / colon phrase).
- General queries miss keyword-heavy evidence (IDs, acronyms, product names, short unique tokens).

2. Ranking is single-channel
- Semantic rank alone can over-prioritize broad topical chunks over exact operational terms.

3. Low diversity in top contexts
- High-score chunks from same document can dominate context window.

### Planned quality improvements
1. Hybrid retrieval for non-exact queries
- Execute semantic vector search and lexical token search together.
- Merge via deterministic reciprocal-rank fusion (RRF).

2. Query-aware lexical signal
- Build lexical candidates from query tokens and score by token hit coverage.
- Feed lexical rank into fusion rather than replacing semantic rank.

3. Context diversity guardrail
- Cap chunks per document in final context list to reduce near-duplicate evidence.

### Risks
1. Latency increase
- Running both semantic and lexical searches can increase retrieval time.
- Mitigation: bound lexical candidate size and keep topK small for final context.

2. Tokenization edge cases (mixed Korean/English/IDs)
- Simple token split may miss some language-specific segmentation.
- Mitigation: keep semantic path active and treat lexical as additive signal.

## 2026-02-27 Addendum - Meeting Notes Coverage Gaps (DB Child Pages)

### User-reported issue
- Even after Notion content access was granted for meeting notes, some meeting-note pages were not discoverable in chat retrieval.

### Root causes identified in current implementation
1. Discovery filter excluded DB child pages
- `targets/discover` currently skips pages whose parent is `data_source_id` or `database_id`.
- Effect: only data source target is created, child pages are not individually visible in allowlist.

2. Permission change + incremental sync skip window
- Incremental ingest skips pages when `last_edited_time <= target.lastSyncAt`.
- If access scope changes without content edit timestamp change, newly accessible pages may not be re-scanned immediately.

### Changes approved
1. Include DB child pages in auto-discovery
- Remove parent-type exclusion so DB child pages can be registered as page targets.

2. Automate one-time full sync on workspace credential update/login
- After successful workspace login (create/update source), trigger one full ingest job automatically when active targets exist.
- Goal: avoid missing newly accessible pages due to incremental timestamp gating.

### Risk notes
1. Potential duplicate ingest paths
- Same page can be reachable via data_source target and page target.
- Mitigation: dedupe page processing within ingest run by notionPageId.

2. Full sync runtime cost
- Automatic full sync increases immediate load after login.
- Acceptable for internal reliability-first setup flow.

## 2026-02-27 Addendum - Page-level Chunk Failure Recovery

### User request
- Add explicit full sync action in UI.
- Log chunk-generation failures into DB.
- Track resolution status for failed pages.
- Allow retry from client for failed pages.

### Findings in current flow
- Page-level failures were only logged to worker logs and aggregated as ingest partial failures.
- No DB entity existed for per-page failure lifecycle.
- Incremental retries could miss failed pages when `lastSyncAt` gating skipped unchanged pages.

### Risk/edge cases considered
- Duplicate retries for same page should collapse into one current failure state.
- Retry should be page-scoped, not full target sweep.
- Successful page reprocessing should automatically resolve stale failure records.
