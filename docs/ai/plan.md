# notion-wiki Implementation Plan (MVP, 2026-02-26)

## 진행 현황 (2026-02-26 기준)

### 완료
- M0 전부 완료
- M1 핵심 골격 완료
  - Source/Target/ingest API
  - Worker ingest 파이프라인(수집->정규화->청킹->임베딩->Qdrant/MySQL)
  - Notion pagination/Retry-After 대응 코드
- M2 핵심 골격 완료
  - `/chat` + citations 구조 반환
  - citation validator/fallback 구현
- M3 일부 완료
  - Web Admin 최소 UI(job 조회/실행/재시도)
  - Source 등록 UI + Notion 연결 테스트
  - Target allowlist 등록/조회/비활성 UI

### 마일스톤 진행도 (백로그 기준)
- M0: 12/12 완료
- M1: 19/20 완료 (통합 테스트 항목 미완)
- M2: 12/14 완료 (Redis retrieval 캐시, E2E 항목 미완)
- M3: 6/12 완료 (운영 지표/런북/안정화 항목 중심으로 미완)

### 진행 필요
- M1/M2 안정화: 실제 연동 smoke test, 오류/엣지케이스 보강
- M3 운영 고도화: Source/Target 설정 UI + 지표 패널/로그 상세/피드백 집계
- 테스트(단위/통합/E2E) 본격 추가

### 미착수 또는 부분 착수
- webhook 재인덱싱 본체(P1)
- MMR/Compression 옵션(P1)
- 캐시 정책 고도화(P1)

## 0) 목표 / 비목표

### 목표
- Notion allowlist 기반 인덱싱(Full + Incremental) 구축
- RAG Q&A + citations 강제(`{chunkId,title,url,quote}`) 구축
- Admin에서 인덱싱 상태/재시도/로그 확인 가능하게 구축
- MySQL/Redis/Qdrant/Gemini/LangChain 조합으로 MVP 완성

### 비목표
- 멀티 테넌트, SSO, RBAC
- Notion 자동 분류/태깅 자동화
- 대규모 샤딩/고QPS 최적화
- 외부 소스(Drive/GitHub/Slack) 통합

## 1) 제안 모노레포 구조

```text
notion-wiki/
  apps/
    api/                      # NestJS HTTP API (admin/chat/source/target/ingest)
    worker/                   # NestJS/Node worker (BullMQ consumers)
    web/                      # React admin + chat UI
  packages/
    config/                   # eslint/tsconfig/env schema
    contracts/                # API DTO, Zod schema, shared types
    db/                       # Prisma schema + migrations + repositories
    notion-client/            # Notion API client (version header/pagination/retry helper)
    llm-provider/             # Gemini-first adapter + provider interface
    retrieval/                # chunking, rerank 옵션, citation formatter
    vector-store/             # Qdrant client wrapper, collection/index bootstrap
    prompts/                  # system/user prompt templates + output parser 규칙
    observability/            # logger, metrics helper, trace ids
    ui/                       # web 공용 컴포넌트(optional)
  docs/
    requirements/
    ai/
      research.md
      plan.md
  infra/
    docker-compose.yml        # mysql/redis/qdrant/local tooling
```

## 2) 모듈 경계 (책임 분리)

1. `apps/api`
- 인증(APP_TOKEN), 입력 검증, DB 조회/쓰기, queue enqueue
- 동기 요청에서 무거운 인덱싱 작업 금지(NFR-REL-001)

2. `apps/worker`
- ingest orchestration(full/incremental/webhook), retry/backoff, 상태 업데이트
- Notion 수집/정규화/청킹/임베딩/Qdrant upsert 전체 수행

3. `packages/notion-client`
- `Notion-Version` 헤더 강제(FR-SRC-002)
- pagination/429 Retry-After 공통 처리(FR-ING-002/003)

4. `packages/retrieval` + `packages/prompts`
- RAG context 조합, citation 추출/검증(FR-CHAT-001/002)
- 근거 부족시 "확인 불가" fallback 강제

5. `packages/vector-store`
- Qdrant collection/payload schema/필터 인덱스 관리(NFR-PERF-002)

6. `packages/llm-provider`
- Gemini 우선 구현 + provider 인터페이스 고정(교체 가능성 확보)

## 3) API / DB / Queue 설계 요구사항 매핑

### 3.1 API 스펙 (MVP)

| Requirement | Endpoint | 핵심 동작 |
|---|---|---|
| FR-SRC-001,002 | `POST /sources/notion` | 토큰 검증 1회 호출 후 Source 생성, Notion-Version 저장 |
| FR-TGT-001 | `POST /sources/:sourceId/targets` | allowlist 대상 추가(`data_source`,`page`) |
| FR-TGT-001 | `GET /sources/:sourceId/targets` | allowlist 조회 |
| FR-TGT-001 | `PATCH /sources/:sourceId/targets/:targetId` | 활성/비활성 전환 |
| FR-ING-001,004 | `POST /ingest/run` | full/incremental job enqueue |
| FR-ADM-001 | `GET /ingest/jobs?sourceId=` | job 상태 조회 |
| FR-ADM-001 | `GET /ingest/jobs/:jobId` | 단일 job 상세(에러, retry 기록 포함) |
| FR-ING-006(P1) | `POST /notion/webhook` | 즉시 200 후 webhook ingest enqueue |
| FR-CHAT-001,002 | `POST /chat` | answer + citations 반환 |
| FR-FB-001(P1) | `POST /feedback` | messageId 기준 피드백 저장 |

### 3.2 DB 스키마 (MySQL, MVP)

1. `sources`
- 컬럼: `id`, `name`, `provider`, `notion_token_enc`, `notion_api_version`, `status`, `created_at`, `updated_at`
- 인덱스: `idx_sources_status`

2. `sync_targets`
- 컬럼: `id`, `source_id`, `target_type`, `target_id_value`, `status`, `last_sync_at`, `created_at`
- 제약: `uniq_source_target(source_id,target_type,target_id_value)`
- 인덱스: `idx_targets_source_status`

3. `documents`
- 컬럼: `id`, `source_id`, `notion_page_id`, `title`, `url`, `last_edited_at`, `status`, `raw_text`, `raw_text_hash`, `indexed_at`
- 제약: `uniq_source_page(source_id,notion_page_id)`
- 인덱스: `idx_docs_source_status_lastedit(source_id,status,last_edited_at)`

4. `document_chunks`
- 컬럼: `id`, `document_id`, `chunk_id`, `chunk_index`, `chunk_text`, `start_offset`, `end_offset`, `token_count`, `content_hash`, `created_at`
- 제약: `uniq_chunk_id(chunk_id)`, `uniq_doc_chunk(document_id,chunk_index,content_hash)`
- 인덱스: `idx_chunks_doc(document_id)`

5. `embedding_refs`
- 컬럼: `id`, `chunk_id`, `provider`, `model`, `vector_dim`, `qdrant_point_id`, `created_at`
- 제약: `uniq_embedding_chunk(chunk_id)`

6. `ingest_jobs`
- 컬럼: `id`, `source_id`, `mode`, `status`, `attempt`, `requested_by`, `started_at`, `finished_at`, `error_code`, `error_message`
- 인덱스: `idx_jobs_source_status_created(source_id,status,id)`

7. `chat_sessions`
- 컬럼: `id`, `source_id`, `created_at`, `updated_at`

8. `chat_messages`
- 컬럼: `id`, `session_id`, `role`, `message_text`, `answer_text`, `citations_json`, `meta_json`, `created_at`
- 인덱스: `idx_messages_session(session_id,id)`

9. `feedback`
- 컬럼: `id`, `message_id`, `score`, `reason`, `created_at`
- 인덱스: `idx_feedback_message(message_id)`

10. `retrieval_logs`
- 컬럼: `id`, `message_id`, `query_text`, `top_k`, `chunk_ids_json`, `scores_json`, `context_tokens_est`, `retrieval_ms`, `llm_ms`, `cache_hit`, `created_at`
- 인덱스: `idx_retrieval_message(message_id)`, `idx_retrieval_created(created_at)`

### 3.3 Qdrant 컬렉션 설계
- `collection`: `notion_chunks`
- `point_id`: `chunkId` (결정적 생성)
- `vector`: Gemini embedding
- `payload` 필수: `sourceId`, `documentId`, `notionPageId`, `chunkIndex`, `title`, `url`, `anchor`, `lastEditedAt`, `status`
- payload index: `sourceId`, `status`, `documentId`, `lastEditedAt` (NFR-PERF-002)

### 3.4 Queue 잡 설계 (BullMQ)

1. `ingest.full`
- payload: `{sourceId, requestedBy, jobId}`
- 역할: 대상 target 전체 순회 + page ingest fan-out

2. `ingest.incremental`
- payload: `{sourceId, since, requestedBy, jobId}`
- 역할: 변경 후보 추출 후 변경 문서만 ingest

3. `ingest.page`
- payload: `{sourceId, notionPageId, targetType, targetId, jobId}`
- 역할: 페이지 메타/블록 수집, normalize/chunk/embed/upsert

4. `ingest.webhook` (P1)
- payload: `{sourceId, entityId, eventType, receivedAt}`
- 역할: 이벤트 신호를 최신 상태 재조회로 변환

5. `ingest.retry.deadletter`
- payload: 원본 잡 + 오류 컨텍스트
- 역할: 최대 재시도 초과 건 저장/관측

재시도 정책:
- Notion 429: `Retry-After` 최우선
- 기타 retryable: exponential + jitter (base 500ms, max 10s)
- non-retryable: auth/bad request 즉시 실패 처리

## 4) 요구사항 추적 매트릭스 (핵심)

| Req ID | 구현 모듈 | 저장소/큐 | 검증 포인트 |
|---|---|---|---|
| FR-SRC-001 | api:sources, notion-client | MySQL `sources` | 잘못된 토큰 401/403 매핑 |
| FR-SRC-002 | notion-client | config | `Notion-Version` 누락 테스트 |
| FR-TGT-001 | api:targets | MySQL `sync_targets` | allowlist 비어있을 때 ingest 거부 |
| FR-ING-001 | worker:ingest.full/page | MySQL + Qdrant + BullMQ | 100개+ 페이지/블록 완주 |
| FR-ING-002 | notion-client paginator | - | `has_more/next_cursor` 완주 |
| FR-ING-003 | worker limiter/retry | BullMQ | 429 + Retry-After 준수 |
| FR-ING-004 | worker incremental | MySQL `last_sync_at`/hash | 수정 후 검색 반영 |
| FR-CHAT-001 | api:chat + retrieval + llm-provider | Qdrant + MySQL logs | answer + citations 응답 |
| FR-CHAT-002 | prompts/parser/citation-validator | chat_messages | citation 누락 시 fallback |
| FR-ADM-001/002 | api:jobs + web admin | ingest_jobs | 상태/재시도 UI 동작 |
| FR-OBS-001 | observability/retrieval log | retrieval_logs | "왜 이 답" 재구성 가능 |

## 5) 마일스톤 백로그 (M0~M3, 1시간 단위)

총 58h 기준(1인 기준, 순차 작업). 병렬 인력 투입 시 단축 가능.

### M0 (기반 구성, 12h)
- M0-01 (1h): pnpm workspace + turbo 초기화
- M0-02 (1h): `apps/api` NestJS 스캐폴드
- M0-03 (1h): `apps/worker` 스캐폴드
- M0-04 (1h): `apps/web` React 스캐폴드
- M0-05 (1h): `packages/contracts`/`config` 생성
- M0-06 (1h): `packages/db`(Prisma) 초기 schema 골격
- M0-07 (1h): docker-compose(mysql/redis/qdrant) 작성
- M0-08 (1h): env schema 및 비밀키 로딩 정책
- M0-09 (1h): API healthcheck + readiness endpoint
- M0-10 (1h): Worker health/queue ping endpoint
- M0-11 (1h): lint/test/build 기본 CI 파이프라인
- M0-12 (1h): 로컬 실행 가이드 문서화

### M1 (인덱싱 Full + 운영 최소, 20h)
- M1-01 (1h): Notion client 기본 구현(헤더 강제)
- M1-02 (1h): Notion token 검증 함수
- M1-03 (1h): Source 등록 API 구현
- M1-04 (1h): Target 등록 API 구현
- M1-05 (1h): Target 조회/비활성 API 구현
- M1-06 (1h): ingest.run API(full/incremental enqueue)
- M1-07 (1h): BullMQ queue 연결/attempt/backoff 기본값
- M1-08 (1h): ingest.full processor 골격
- M1-09 (1h): data_source pagination 수집 구현
- M1-10 (1h): block children 재귀 + pagination 구현
- M1-11 (1h): Notion block normalize 구현
- M1-12 (1h): chunking(700~900, overlap 100~150) 구현
- M1-13 (1h): contentHash/chunkId 결정 규칙 구현
- M1-14 (1h): Gemini embedding adapter 구현
- M1-15 (1h): Qdrant collection bootstrap + payload index 생성
- M1-16 (1h): Qdrant upsert + status 필터 전략 구현
- M1-17 (1h): Document/Chunk/EmbeddingRef upsert 트랜잭션
- M1-18 (1h): ingest job 상태/에러 로깅 구현
- M1-19 (1h): jobs 조회 API + 간단 admin 표 화면
- M1-20 (1h): 통합 테스트(100+ pagination, 429 retry)

### M2 (RAG Chat + Citation 강제, 14h)
- M2-01 (1h): chat session/message 스키마 확정
- M2-02 (1h): `/chat` API 핸들러 골격
- M2-03 (1h): query embedding + Qdrant topK 검색
- M2-04 (1h): 검색 필터(`sourceId`,`status=active`) 적용
- M2-05 (1h): prompt builder(근거 기반/확인 불가 규칙) 구현
- M2-06 (1h): Gemini generation adapter 구현
- M2-07 (1h): 출력 parser(JSON 우선, 실패시 텍스트 fallback)
- M2-08 (1h): citation validator 구현(필드/길이/출처 검사)
- M2-09 (1h): quote 추출기 구현(실제 chunk 발췌)
- M2-10 (1h): 근거 부족 fallback(`answer=확인 불가`, citations=[])
- M2-11 (1h): retrieval_logs 저장(지연/점수/chunkIds)
- M2-12 (1h): Redis retrieval 캐시(기본 on) 추가
- M2-13 (1h): web chat UI + citation 링크 렌더
- M2-14 (1h): E2E(질문→답변→citation 원문 확인)

### M3 (Admin 고도화 + 운영성, 12h)
- M3-01 (1h): Admin 대시보드 API(문서/청크/잡 카운트)
- M3-02 (1h): Admin job 상세 API(에러/retry 이력)
- M3-03 (1h): full/incremental 실행 버튼 + 상태 반영
- M3-04 (1h): 실패 job 재시도 API/버튼
- M3-05 (1h): 관측 메트릭 패널(P50/P95, cache hit, 429 count)
- M3-06 (1h): 최소 피드백 API/저장(👍/👎)
- M3-07 (1h): 보안 점검(토큰 노출/로그 마스킹)
- M3-08 (1h): 장애 런북(429/5xx/Qdrant 다운)
- M3-09 (1h): 릴리스 체크리스트 + smoke test 스크립트
- M3-10 (1h): Source 등록 UI(이름/토큰/Notion-Version) + 연결 테스트
- M3-11 (1h): Target allowlist 등록/조회/비활성 UI(`data_source`,`page`) + ingest 실행 진입
- M3-12 (1h): 안정화 버그픽스 버퍼

## 6) 리스크 및 대응

1. Notion pagination 누락
- 대응: page list, block children 각각 paginator 유닛 테스트 + 통합 테스트 분리

2. Notion rate limit/429 폭증
- 대응: worker 전역 limiter + Retry-After 우선 + 지수 backoff + deadletter 큐

3. 재시도 중복 인덱싱
- 대응: 결정적 `chunkId` + MySQL unique 제약 + Qdrant upsert idempotency

4. Qdrant payload/index 미비로 검색 느림
- 대응: collection bootstrap 시 payload index 강제 생성 및 부팅 검증

5. Citation 품질 저하/누락
- 대응: parser 후 validator 강제, 실패 시 "확인 불가"로 안전 전환

6. 벤더 장애(Gemini 429/5xx)
- 대응: provider 에러 코드 표준화 + retryable 분기 + timeout 엄격 설정

## 7) 파일 단위 변경 계획 (구현 단계 기준)

1. `apps/api/*`
- source/target/ingest/chat/feedback/admin endpoint 구현

2. `apps/worker/*`
- ingest processor, scheduler, retry/deadletter, limiter 구현

3. `apps/web/*`
- Chat UI, Admin jobs/status/retry UI 구현

4. `packages/db/*`
- 스키마/마이그레이션/리포지토리 구현

5. `packages/notion-client/*`
- Notion API 버전/페이지네이션/rate-limit 대응 구현

6. `packages/vector-store/*`
- Qdrant upsert/search/filter/payload index 구현

7. `packages/llm-provider/*`
- Gemini embedding/chat adapter + error mapping 구현

8. `packages/retrieval/*`, `packages/prompts/*`
- chunking, retrieval pipeline, citation formatter/validator 구현

9. `packages/observability/*`
- structured logs + 메트릭 유틸 구현

## 8) 검증 계획
- Unit: normalize/chunking/citation validator/provider error mapping
- Integration: Notion pagination, 429 Retry-After, Qdrant upsert/search/filter
- E2E: full sync→chat+citation, incremental 반영, admin 재시도

## 9) 롤백 노트
- API 배포는 feature flag로 endpoint 단계적 공개
- ingest worker는 큐 일시 정지 후 롤백 가능하도록 독립 배포
- DB 변경은 forward migration + 보수적 nullable 시작
- Qdrant 컬렉션 스키마 변경은 신규 컬렉션 생성 후 스위치 방식 사용

## 10) 실행 상태
- M0는 완료되었고 M1/M2 핵심 골격, M3 일부 기능(Source/Target UI 포함)까지 구현됨.
- 다음 우선순위는 `M1-20`(pagination/429 통합 테스트), `M2-12`(Redis retrieval 캐시), `M2-14`(E2E) 순으로 진행.

## 2026-02-26 Delta (Auto Target Discovery)
- [M1-01][done] Notion client now supports `/search` pagination for source-wide discovery.
- [M1-05][done] Added API endpoint `POST /sources/:sourceId/targets/discover` to bulk register discoverable targets.
- [M3-11][done] Added web UI action `Auto Discover` in target allowlist setup.
- Behavior: discovery registers `data_source` targets and top-level `page` targets visible to the integration token; existing inactive matches are reactivated.
- [M2-03,M2-10][done] Added chat-side Qdrant collection recovery to prevent 500 on first-use or missing collection scenarios.
- [M1-15,M1-16][done] Qdrant collection/index bootstrap changed to idempotent behavior (409-safe) to prevent ingest abort loops.
- [M1-17][done] Qdrant point IDs migrated to deterministic UUID while keeping `chunkId` in payload for citation continuity.
- [M1-10][done] Notion recursive block fetch now skips unsupported `ai_block` child traversal.
- [M2-06][done] Gemini chat adapter now has compatibility fallbacks for models without developer instruction / JSON mode support.
- [M2-10][done] Chat service now returns citation-backed fallback response when LLM generation fails.
- [M2-03,M2-10][done] Chat retrieval now supports lexical exact/partial phrase lookup mode to avoid semantic false positives for "find this sentence" requests.
- [M1-08,M1-18][done] Ingest run now uses page-level error isolation to reduce full-job failure blast radius.

## 2026-02-27 Delta (Web UI Direction)
- [M2-13,M3-10,M3-11][in_progress] Finalized web UI reference direction and wireframe baseline for admin/chat flows.
- [M2-13,M3-10,M3-11][in_progress] Chosen reference combinations:
  - Combo A (recommended): shadcn blocks + Vercel AI chatbot pattern + Radix accessibility baseline.
  - Combo B (secondary): docs explorer shell + cmdk command palette pattern.
- [M3-12][todo] Apply the selected direction to `apps/web` with a three-column operator layout and citation inspector.
- Detail spec: `docs/ai/ui-direction.md`

## 2026-02-27 Delta (Web UI Implementation)
- [M2-13,M3-10,M3-11][done] Applied Combo A direction to `apps/web` with a 3-column operator layout (setup/admin, chat thread, citation inspector).
- [M2-13][done] Upgraded chat UI to thread-style history with sticky composer and citation selection workflow.
- [M3-10,M3-11][done] Improved setup UX with readiness chips, active target count, and ingest guardrails (run buttons disabled when active target is empty).
- [M3-03,M3-04][done] Consolidated ingest controls and job table filters in the operator view.
- [M3-12][in_progress] Remaining stabilization: visual polish, microcopy tuning, and optional keyboard flow expansion.

## 2026-02-27 Delta (M3-12 Stabilization Pass)
- [M3-12][in_progress] Added keyboard-first operations: `Ctrl/Cmd+Enter` ask, `Esc` citation clear, `Alt+R` refresh state.
- [M3-12][in_progress] Added citation selection persistence/highlight and inspector metadata (selection index, selected-at timestamp, source URL missing fallback).
- [M3-12][in_progress] Improved microcopy and guardrails: ingest lock reason, quick-start empty state, and setup jump action.
- [M3-12][in_progress] Preserved notice messages during `fetchJobs/loadTargets` refresh paths by limiting those paths to error-only clears.

## 2026-02-27 Delta (M2-14 E2E Automation)
- [M2-14][done] Added runnable smoke E2E script `scripts/e2e-chat-citation.mjs` with:
  - source/target readiness checks
  - optional ingest run + polling
  - `/chat` response schema validation
  - citation quote vs MySQL `document_chunks` verification
- [M2-14][done] Added root command `npm run e2e:chat` and README execution guide with env overrides.
- [M2-14][done] Runtime result snapshot:
  - pass with lexical phrase query + `E2E_RUN_INGEST=false`
  - pass with ingest-included run (`E2E_RUN_INGEST=true`, `jobId=15`) with partial-failure warning surfaced in summary output.

## 2026-02-27 Delta (M3-12 QA Checklist)
- [M3-12][in_progress] Added QA checklist document `docs/ai/ui-qa-checklist.md` and recorded automated validation (`web build`, script syntax check).
- [M3-12][in_progress] Manual browser runtime checks are still pending (hotkey conflicts, mobile-width behavior, live citation open flow).

## 2026-02-27 Delta (M1-20 Integration Test)
- [M1-20][done] Added `scripts/test-notion-client.mjs` for mock-server integration checks of:
  - pagination completion over 100+ items
  - `429 Retry-After` retry behavior
- [M1-20][done] Added root command `npm run test:notion-client` and README guide entry.
- [M1-20][done] Execution result: pass (`paginationPages=205`, `queryCalls=3`, `searchCalls=2`, `retryElapsedMs=1031`).

## 2026-02-27 Status Snapshot
- M0: 12/12 done
- M1: 20/20 done
- M2: 13/14 done (`M2-12` pending)
- M3: 6/12 done + `M3-12` in_progress (stabilization/QA checklist ongoing)

## 2026-02-27 Delta (UX Pivot: Chat-First Main + DB-Backed Notion Login)

### Goals
- Make the main screen chat-first for everyday internal usage.
- Remove operator-heavy setup blocks (`Access`, `Ingest jobs`) from the primary user path.
- Auto-load source configuration from DB on app start.
- Show token login/setup only when DB has no usable source credentials.
- Replace bottom static errors/notices with toast notifications.
- Align visual direction with modern SaaS UX cues from:
  - https://www.thefrontendcompany.com/posts/ui-trends
  - Focused trends for this product: hyper-personalized onboarding and unified search/chat-first interaction.

### Non-goals
- No retrieval algorithm change (semantic/lexical behavior remains as-is).
- No vector store or schema migration for this UI pivot.
- No removal of existing admin/ingest APIs (they remain available; only main UI path changes).
- No workspace-wide auth model redesign in this iteration.

### Data model changes
- None (reuse existing `sources`, `sync_targets`, `documents`, `ingest_jobs`).

### Implementation plan (file-by-file)
1. API bootstrap and login flow
- Add `apps/api/src/workspace.controller.ts`
  - `GET /workspace/bootstrap`:
    - Resolve default source from DB (active source, newest first).
    - Return source summary + readiness indicators (`activeTargetCount`, `documentCount`, latest ingest status).
  - `POST /workspace/login`:
    - Validate Notion token.
    - If no active source exists: create source.
    - If active source exists: rotate/update stored token + notion version on that source.
    - Optional immediate target discovery (same behavior as existing discover endpoint).
- Add `apps/api/src/workspace.service.ts`
  - Implement source bootstrap selection and login/update logic.
  - Reuse `SourcesService` and `TargetsService`.
- Update `apps/api/src/sources.service.ts`
  - Add credential update path for existing source (`updateSourceCredentials`).
- Update `apps/api/src/app.module.ts`
  - Register workspace controller/service.

2. Shared contracts
- Update `packages/contracts/src/api.ts`
  - Add request/response schemas for workspace bootstrap/login payloads.

3. Web app UX rewrite (main page)
- Rewrite `apps/web/src/App.tsx` to two-mode flow:
  - `setup/login` mode: shown only when bootstrap says no source.
  - `chat` mode: primary screen with chat thread + composer + citation UI only.
- Remove Access panel and jobs table from main path.
- Keep a small secondary settings action (for reconnect token / manual sync trigger) without exposing legacy operator clutter.
- Add bootstrap load on startup; no manual sourceId/sessionId required in primary flow.

4. Toast feedback system
- Add lightweight toast state and renderer in `apps/web/src/App.tsx` (or extracted local component file).
- Convert API success/error handling from bottom text (`notice`, `error`) to toast queue (success/warn/error).
- Ensure keyboard and screen-reader accessibility for toasts (`aria-live`).

5. Visual refresh
- Update `apps/web/src/styles.css` to modern chat-first layout:
  - cleaner hierarchy, larger readable spacing, contemporary card treatment
  - expressive but restrained background treatment
  - simpler, focused main interaction surface (composer + evidence thread)

6. Runtime config simplification
- Remove user-facing APP token input from UI.
- Use runtime config (`VITE_APP_TOKEN`) for API authorization header injection in web client.
- Keep existing backend guard behavior unchanged for now.

### Validation plan
1. Build/type checks
- `npm run --workspace @notion-wiki/api build`
- `npm run --workspace @notion-wiki/web build`

2. Manual UX verification
- No source in DB -> login/setup screen appears.
- Successful login -> chat-first screen appears.
- Reload after login -> setup skipped; source bootstrap is automatic.
- Chat request/response with citations still works.
- Error and success messages appear as toasts and remain visible while scrolling.

3. Regression checks
- Existing `/sources/*`, `/ingest/*`, `/chat` endpoints still callable.
- Existing E2E script `npm run e2e:chat` still works (with configured source state).

### Rollback notes
- Revert web UI to previous operator console (`apps/web/src/App.tsx`, `apps/web/src/styles.css`).
- Keep new workspace endpoints disabled/unreferenced by UI (non-breaking).
- No DB migration rollback required.

### Approval-required choices (before implementation)
1. Default source selection
- Proposed: newest active source (`ORDER BY id DESC`) as default bootstrap source.

2. Login behavior for existing source
- Proposed: update credentials of default source instead of creating many new sources.

3. Auto discovery on login
- Proposed: enabled by default to reduce setup friction.
- Note: can increase Notion API calls on login.

## 2026-02-27 Delta (Option 3: Retrieval Quality Improvement, Model Fixed)

### Goals
- Improve chat evidence relevance without changing embedding model.
- Reduce misses for keyword-heavy operational queries.
- Keep answer+citation contract unchanged.

### Non-goals
- No embedding provider/model migration.
- No DB schema migration.
- No major prompt redesign.

### File-by-file changes
1. `apps/api/src/chat.service.ts`
- Add hybrid retrieval path for non-exact queries:
  - semantic vector search
  - lexical token match search
  - reciprocal-rank fusion (RRF) merge
- Add per-document diversity cap in final retrieval list.
- Keep existing exact phrase path as-is for quote/colon queries.
- Extend logs with retrieval composition metadata (semantic/lexical counts, hybrid enabled).

2. `docs/ai/research.md`
- Record reasons model swap is currently blocked and why retrieval strategy is chosen.

3. `docs/ai/plan.md`
- Record this delta and validation scope.

### Validation plan
1. Build/type checks
- `npm run --workspace @notion-wiki/api build`

2. Behavioral spot checks
- Exact quote query still returns deterministic exact/partial path.
- Non-exact keyword query returns mixed semantic+lexical evidence.
- Chat endpoint response schema remains unchanged.

3. Regression
- `npm run --workspace @notion-wiki/web build`

## 2026-02-27 Delta (Meeting Notes Coverage: DB Child Targets + Auto Full Sync)

### Goals
- Ensure meeting-note pages under Notion data sources are discoverable as targets.
- Prevent permission-change blind spots by triggering one full sync after workspace login/update.

### Non-goals
- No schema migration.
- No removal of data_source target behavior.

### File-by-file changes
1. `apps/api/src/targets.service.ts`
- Remove exclusion of `parentType === data_source_id/database_id` in target discovery.
- Include DB child pages as discoverable `page` targets.

2. `apps/worker/src/worker.service.ts`
- Add ingest-run dedupe set by `notionPageId` to avoid duplicate page processing when both data_source and page targets reference same page.

3. `packages/contracts/src/api.ts`
- Extend workspace login schema/response for auto full sync behavior.

4. `apps/api/src/workspace.service.ts`
- After workspace login/create-update + optional discovery, queue one `full` ingest job when active targets exist.
- Return queued job metadata in login response.

5. `apps/web/src/App.tsx`
- Surface toast notice when full sync is auto-queued after login.

### Validation plan
1. Build checks
- `npm run --workspace @notion-wiki/contracts build`
- `npm run --workspace @notion-wiki/api build`
- `npm run --workspace @notion-wiki/web build`

2. Behavioral checks
- `targets/discover` now returns DB child pages in counts/created targets.
- Workspace login returns queued full sync job when active targets exist.
- Ingest run processes each notionPageId once even with overlapping targets.

## 2026-02-27 Delta (Page Failure Lifecycle + Full Sync UI)

### Goals
- Add manual `full sync` trigger in web UI.
- Persist per-page chunk-ingest failures in DB with lifecycle status.
- Support page-scoped retry from client.

### File-by-file changes
1. `packages/db/prisma/schema.prisma`
- Added `IngestPageFailureStatus` enum and `IngestPageFailure` model.
- Added relations from `Source` and `IngestJob`.

2. `packages/db/prisma/migrations/20260227073025_add_ingest_page_failures_retry/migration.sql`
- Created `ingest_page_failures` table with indexes and FK constraints.

3. `packages/contracts/src/queue.ts`
- Extended ingest run payload with optional `pageIds` and `retryFailureId`.

4. `packages/contracts/src/api.ts`
- Added schemas/types for ingest page failure list outputs.

5. `apps/worker/src/worker.service.ts`
- Added page-scoped ingest run path (`pageIds`) for targeted retries.
- Added stage-aware page processing error wrapping.
- Added DB upsert logging for page failures.
- Added auto-resolve update when page processing succeeds.

6. `apps/api/src/ingest.service.ts`
- Added `listPageFailures` and `retryPageFailure` methods.
- Retry now queues incremental ingest with target `pageIds`.

7. `apps/api/src/ingest.controller.ts`
- Added:
  - `GET /ingest/page-failures`
  - `POST /ingest/page-failures/:failureId/retry`

8. `apps/web/src/App.tsx`
- Added manual full sync actions in header/settings.
- Added page-failure list panel in workspace settings.
- Added retry action per failed page.

9. `apps/web/src/styles.css`
- Added styles for page-failure panel/list rows.

### Validation plan
- Build checks:
  - `npm run --workspace @notion-wiki/contracts build`
  - `npm run --workspace @notion-wiki/api build`
  - `npm run --workspace @notion-wiki/worker build`
  - `npm run --workspace @notion-wiki/web build`
- Runtime checks:
  - Full sync button queues `mode=full`.
  - Page failure appears in DB and settings panel on page-level ingest failure.
  - Retry button queues targeted page retry and resolves status after success.
