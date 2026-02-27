# notion-wiki 작업일지 (세션 이관용)

## 메타
- 작성일: 2026-02-26
- 기준 문서:
  - `Requirements.md`
  - `docs/requirements/*`
- `docs/ai/research.md`
- `docs/ai/plan.md`
- 목적: 세션이 바뀌어도 바로 이어서 구현/검증 가능하도록 현재 상태와 다음 액션 고정

---

## 기록 규칙 (업무번호 매핑 필수)

### 필수 규칙
- worklog의 모든 작업 항목은 `docs/ai/plan.md` 업무번호를 반드시 포함한다.
- 표기 형식: `[업무번호][상태] 작업 내용`
  - 예: `[M1-03][done] Source 등록 API 구현`
- 한 항목이 여러 업무번호를 포함하면 콤마로 병기한다.
  - 예: `[M1-09,M1-10][done] Notion page/block pagination 완주 로직 구현`
- plan에 없는 작업은 임시로 `[UNPLANNED]`로 기록하고, 같은 세션에서 plan에도 번호를 추가한다.
- 상태값은 `done`, `in_progress`, `blocked`, `todo`만 사용한다.

### 템플릿
```md
## YYYY-MM-DD
- [M1-03][done] Source 등록 API 구현 (`apps/api/src/sources.controller.ts`)
- [M1-20][in_progress] pagination + 429 통합 테스트 작성 중
- [UNPLANNED][blocked] 외부 의존성 오류로 중단 (plan 반영 필요)
```

---

## 1) 현재 진행 상태 요약

### 완료
- [M0-01][done] workspace + turbo 초기화 (`pnpm` 대신 `npm workspaces` 사용)
- [M0-02,M0-03,M0-04][done] `apps/api`, `apps/worker`, `apps/web` 스캐폴딩
- [M0-05][done] `packages/contracts`, `packages/config` 생성
- [M0-06][done] Prisma 스키마 골격 및 엔티티 모델링
- [M0-07][done] `infra/docker-compose.yml` 작성(mysql/redis/qdrant)
- [M0-08][done] `.env.example` + env schema + secret 암복호화 유틸
- [M0-09][done] API healthcheck (`GET /health`)
- [M0-10][done] Worker health/queue ping endpoint (`GET /health`, `GET /queue/ping`)
- [M0-11][done] CI 파이프라인 추가 (`.github/workflows/ci.yml`: npm ci -> db:generate -> lint/test/build)
- [M0-12][done] 로컬 실행 가이드 (`README.md`)
- [M1-01,M1-09,M1-10][done] Notion client(Version 헤더, pagination, retry)
- [M1-02][done] Notion token 검증 함수 + Source 등록 시 검증 호출
- [M1-03][done] Source 등록 API 구현
- [M1-04,M1-05][done] Target 등록/조회/비활성 API 구현
- [M1-06][done] ingest.run API 구현(full/incremental enqueue)
- [M1-07][done] BullMQ 연결 + attempts/backoff 기본값 적용
- [M1-08][done] ingest worker processor 골격 구현
- [M1-11][done] Notion block normalize 구현
- [M1-12,M1-13][done] chunking + contentHash/chunkId 규칙 구현
- [M1-14][done] Gemini embedding adapter 구현
- [M1-15,M1-16][done] Qdrant collection/payload index/upsert/search 구현
- [M1-17][done] Document/Chunk/EmbeddingRef upsert 경로 구현
- [M1-18][done] ingest job 상태/에러 로깅 구현
- [M1-19][done] jobs 조회 API + web admin job 테이블 구현
- [M2-01,M2-02][done] chat session/message + `/chat` 핸들러 구현
- [M2-03,M2-04][done] query embedding + source/status 필터 topK 검색
- [M2-05][done] 시스템 프롬프트 규칙/컨텍스트 구성 구현
- [M2-06][done] Gemini generation adapter 구현
- [M2-07][done] 출력 parser(JSON 우선, 실패 fallback) 구현
- [M2-08,M2-09][done] citation validator + quote extractor 구현
- [M2-10][done] 근거 부족 시 `확인 불가` fallback 구현
- [M2-11][done] retrieval_logs 저장 구현
- [M2-13][done] web chat UI + citation 렌더 구현
- [M3-02][done] Admin job 상세 API 구현
- [M3-03,M3-04][done] full/incremental 실행 + 실패 재시도 UI/API 구현
- [M3-06][done] feedback API/저장 구현
- [M3-10][done] Source 등록 UI(토큰/버전) + 연결 테스트 버튼 구현
- [M3-11][done] Target allowlist 등록/조회/비활성 UI + ingest 진입 구현
- [M0-12][done] dev 세션 종료 스크립트 추가(`npm run dev:stop`, tracked pid 기반 종료)
- [UNPLANNED][done] Prisma env 로딩 문제 수정(`packages/db` 스크립트에 `dotenv -e ../../.env` 적용)
- [UNPLANNED][done] Windows `spawn EINVAL` 수정(`dev-start`를 `cmd.exe /c turbo ...` 방식으로 변경)
- [UNPLANNED][done] `npm run dev` 시작 지연 개선(`turbo` 필터를 `apps/api,apps/worker,apps/web`로 제한)
- [UNPLANNED][done] API CORS 허용 추가(`CORS_ORIGINS`, localhost:5173 -> localhost:3000 브라우저 호출 허용)
- [VERIFY][done] `npm install`, `npm run db:generate`, `npm run build` 성공

### 미완료(다음 세션 우선)
- [M1-20][todo] pagination/429 통합 테스트
- [M2-12][todo] Redis retrieval 캐시
- [M2-14][todo] chat+citation E2E 테스트
- [M3-01][todo] Admin 대시보드 카운트 API
- [M3-05][todo] 관측 메트릭 패널(P50/P95, cache hit, 429)
- [M3-07][todo] 보안 점검 체크리스트/검증 결과 문서화
- [M3-08][todo] 장애 런북 작성
- [M3-09][todo] 릴리스 체크리스트 + smoke script
- [M3-12][todo] 안정화 버그픽스 버퍼
- [P1: FR-ING-006][todo] webhook 재인덱싱 본체 + (NFR-SEC-003) 서명 검증

---

## 2) 마일스톤 기준 진행률

- M0: 12/12 완료
- M1: 19/20 완료 (`M1-20` 미완)
- M2: 12/14 완료 (`M2-12`, `M2-14` 미완)
- M3: 6/12 완료 (`M3-01`,`M3-05`,`M3-07`,`M3-08`,`M3-09`,`M3-12` 미완)

---

## 3) 핵심 의사결정 기록

1. 워크스페이스
- `npm workspaces + turbo` 채택

2. DB
- Prisma + MySQL 스키마 사용
- 문서/청크 idempotency를 위해 `chunkId` unique + `(documentId, chunkIndex, contentHash)` unique 적용

3. 벡터 저장
- Qdrant `point_id = chunkId`
- payload 필드: `sourceId`, `documentId`, `notionPageId`, `chunkIndex`, `title`, `url`, `text`, `lastEditedAt`, `status`
- payload index 생성 코드 포함

4. citation 강제
- 파서/검증 실패 시 빈 citation 허용하지 않고 첫 번째 retrieval context 기반 fallback citation 생성
- 근거 자체가 없으면 `확인 불가` + 빈 citations

5. 보안
- APP_TOKEN 기반 단일 관리자 인증 가드
- Notion 토큰은 DB 저장 시 암호화 유틸 적용(앱 레벨)

---

## 4) 다음 세션 즉시 실행 절차

1. 인프라 실행
```bash
docker compose -f infra/docker-compose.yml up -d
```

2. 의존성/클라이언트 생성
```bash
npm install
npm run db:generate
```

3. 마이그레이션 실행
```bash
npm run db:migrate
```

4. 앱 실행
```bash
npm run dev
```

5. 헬스체크
```bash
curl http://localhost:3000/health
```

---

## 5) 다음 작업 백로그 (권장 순서)

### P0
1. [M1-20] Notion pagination + 429 통합 테스트 작성
2. [M2-12] Redis retrieval 캐시 구현
3. [M2-14] Source/Target -> Full ingest -> `/chat` E2E 검증
4. [M3-01] Admin 대시보드 카운트 API
5. [M3-05] 관측 메트릭 패널 구현

### P1
1. [FR-ING-006] webhook 이벤트 수신 후 재인덱싱 구현
2. [NFR-SEC-003] webhook 서명 검증 구현
3. [FR-CHAT-003] MMR/Compression 옵션 토글 추가
4. [FR-CHAT-004] Redis 캐시 정책(TTL/key) 고도화

---

## 6) 리스크/주의사항

1. Notion API 변화/쿼리 스펙 차이
- `data_sources/*` 엔드포인트 동작은 실제 워크스페이스에서 검증 필요

2. rate limit
- 현재 클라이언트 내부 간격 제어 + retry 적용
- 실제 트래픽에서 worker concurrency/limiter 추가 조정 필요

3. Qdrant 인덱스 생성
- 컬렉션 차원 수(dimension)는 첫 embedding 결과에 의존
- 운영 시 고정 dimension 정책 필요

4. citation 품질
- 현재 fallback 로직은 안전하지만 품질 측면에서 보수적
- parser schema 강화와 quote provenance 검증 테스트 필요

---

## 7) 빠른 파일 네비게이션

- 계획/조사
  - `docs/ai/research.md`
  - `docs/ai/plan.md`
- API 진입점
  - `apps/api/src/app.module.ts`
  - `apps/api/src/ingest.controller.ts`
  - `apps/api/src/chat.service.ts`
- Worker 진입점
  - `apps/worker/src/worker.service.ts`
- 스키마
  - `packages/db/prisma/schema.prisma`
- Notion/Qdrant/Gemini
  - `packages/notion-client/src/client.ts`
  - `packages/vector-store/src/qdrantClient.ts`
  - `packages/llm-provider/src/geminiProvider.ts`

---

## 8) 다음 세션 시작 시 체크리스트

- [ ] `.env` 설정 확인(APP_TOKEN, DATABASE_URL, REDIS_URL, QDRANT_URL, GEMINI_API_KEY)
- [ ] `db:migrate` 성공 여부 확인
- [ ] API/Worker/Web 동시 기동 확인
- [ ] Source/Target/ingest/chat 기본 흐름 수동 검증
- [ ] 실패 케이스(잘못된 Notion token, allowlist empty) 검증
- [ ] 테스트 코드 작성 시작(단위 -> 통합 -> E2E 순서)

## 2026-02-26 - Auto Target Discovery Update
- [M1-01,M1-05][done] Added Notion `/search` pagination support in `packages/notion-client` and exposed `listAllSearchResults()`.
- [M1-05][done] Added `POST /sources/:sourceId/targets/discover` to discover all accessible targets from the current source token and upsert into `sync_targets`.
- [M1-05][done] Discovery reactivates previously inactive targets when they are rediscovered.
- [M3-11][done] Added web UI button `Auto Discover` in Notion Setup > Target Allowlist so target IDs do not need manual entry.
- [M0-12][done] Updated `README.md` endpoint list with `/sources/:sourceId/targets/discover`.
- [M2-03,M2-10][done] Patched chat retrieval path to recover from missing Qdrant collection (404) by auto-creating collection/indexes and degrading to empty retrieval instead of 500.
- [M1-15,M1-16][done] Fixed Qdrant bootstrap idempotency: ignore 409 already-exists for collection/index creation and use correct payload index schemas (`integer`/`keyword`/`datetime`).
- [M1-17][done] Fixed Qdrant point ID format by using deterministic UUID (`qdrantPointId`) while preserving logical `chunkId` in payload/citation flow.
- [M1-10][done] Hardened Notion block traversal to skip unsupported `ai_block` children instead of failing whole recursive traversal.
- [M2-06][done] Gemini provider chat now retries without `systemInstruction` for models that do not support developer instructions.
- [M2-06][done] Gemini provider chat now falls back from JSON mode to plain text when model does not support JSON response mode.
- [M2-10][done] Chat endpoint now degrades gracefully on LLM generation failure and still returns citation-backed response instead of HTTP 500.
- [M2-03,M2-10][done] Added lexical-first retrieval path in chat for quote/colon phrase queries; exact phrase lookups no longer fall back to unrelated semantic answers.
- [M2-03][done] Added partial lexical token matching fallback when exact phrase is missing, with explicit response label (`exact not found, partial matches found`).
- [M2-10][done] For exact phrase queries with no match, chat now returns deterministic `exact phrase not found` (llmMs=0) instead of opaque `Ȯ�� �Ұ�`.
- [M1-08,M1-18][done] Ingest worker now isolates page-level failures and continues indexing remaining pages; job is marked succeeded with partial-failure diagnostics instead of full abort.

## 2026-02-27 - Web UI Direction Baseline
- [M2-13,M3-10,M3-11][in_progress] Defined final web UI reference combinations and screen-level wireframe baseline for notion setup, chat, citations, and admin jobs.
- [M2-13,M3-10,M3-11][in_progress] Added `docs/ai/ui-direction.md` with concrete layout rules, interaction constraints, and implementation mapping.
- [M3-12][todo] Next implementation step is applying the selected Combo A direction in `apps/web/src/App.tsx` and `apps/web/src/styles.css`.

## 2026-02-27 - Web UI Implementation (Combo A)
- [M2-13,M3-10,M3-11][done] Implemented 3-column operator layout in `apps/web/src/App.tsx` (setup/admin, evidence chat thread, citation inspector).
- [M2-13][done] Reworked chat into thread-style history with sticky composer and citation selection.
- [M3-10,M3-11][done] Added setup readiness chips and ingest guardrails (disable run when active targets are empty).
- [M3-03,M3-04][done] Added ingest job filters (mode/status) and kept retry actions in the jobs panel.
- [M3-12][in_progress] Applied UI system updates in `apps/web/src/styles.css` (responsive grid, status badges, focus-visible accessibility styles).
- [M2-13][done] Validation: `npm run --workspace @notion-wiki/web build` succeeded after the UI refactor.

## 2026-02-27 - M3-12 Stabilization Pass
- [M3-12][in_progress] Added keyboard-first controls in `apps/web/src/App.tsx`: `Ctrl/Cmd+Enter` submit, `Esc` clear citation selection, `Alt+R` refresh state.
- [M3-12][in_progress] Added citation selection highlighting and richer inspector context (selection index, timestamp, URL missing fallback).
- [M3-12][in_progress] Improved UI microcopy and guardrails: ingest lock reason, setup jump action, and quick-start chat empty state.
- [M3-12][in_progress] Stabilized message behavior by keeping notices during background target/job refresh (`loadTargets`/`fetchJobs` now clear only errors).
- [M3-12][done] Validation: `npm run --workspace @notion-wiki/web build` passed after stabilization changes.

## 2026-02-27 - M2-14 E2E Automation
- [M2-14][in_progress] Added `scripts/e2e-chat-citation.mjs` for executable smoke E2E (target readiness, optional ingest poll, `/chat` validation, citation->DB chunk quote verification).
- [M2-14][in_progress] Added root command `npm run e2e:chat` and README usage/env override docs.
- [M2-14][in_progress] Runtime check: ingest-included run timed out (`jobId=14`, 10m, still running) so ingest-inclusive pass is pending.
- [M2-14][done] Runtime check: lexical phrase mode passed with ingest skipped (`E2E_RUN_INGEST=false`, `E2E_CHAT_MESSAGE=...forcura.com`).

## 2026-02-27 - M3-12 QA Checklist
- [M3-12][in_progress] Added `docs/ai/ui-qa-checklist.md` with automated and manual validation items.
- [M3-12][done] Automated checks passed: `npm run --workspace @notion-wiki/web build`, `node --check scripts/e2e-chat-citation.mjs`.
- [M3-12][in_progress] Manual browser checks are pending (hotkey conflict, narrow-width overflow, live citation open behavior).

## 2026-02-27 - M1-20 Integration Test
- [M1-20][done] Added `scripts/test-notion-client.mjs` using a local mock server to verify `has_more/next_cursor` pagination over 205 items.
- [M1-20][done] Added `429 Retry-After` behavior verification in the same script (first call 429, second call success, elapsed delay checked).
- [M1-20][done] Added root command `npm run test:notion-client` and README instructions.
- [M1-20][done] Validation result: pass (`paginationPages=205`, `queryCalls=3`, `searchCalls=2`, `retryElapsedMs=1031`).

## 2026-02-27 - Status Snapshot
- M0: 12/12 done
- M1: 20/20 done (M1-20 completed with mock integration test)
- M2: 12/14 done + 1 in_progress (M2-14 automation added, ingest-inclusive pass pending)
- M3: 6/12 done + 1 in_progress (M3-12 stabilization/QA checklist in progress)

## 2026-02-27 - M2-14 Completion Update
- [M2-14][done] Ingest-included E2E run passed (`E2E_RUN_INGEST=true`, `jobId=15`) and chat+citation validation completed successfully.
- [M2-14][done] Script now surfaces ingest partial-failure metadata as warnings in PASS summary instead of silently ignoring them.
- [M2-14][done] Confirmed no-ingest lexical mode also passes for fast smoke checks.

## 2026-02-27 - Status Snapshot (Updated)
- M0: 12/12 done
- M1: 20/20 done
- M2: 13/14 done (`M2-12` pending)
- M3: 6/12 done + `M3-12` in_progress
