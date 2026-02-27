# Codebase Review Feedback (2026-02-27)

> Scope: notion-wiki 전체 코드베이스 대비 요구사항/plan 기준 갭 분석
> Reviewer: AI Agent (Claude)
> Status: M0 12/12, M1 20/20, M2 13/14, M3 6/12 + M3-12 in_progress

---

## 1. 테스트 — 가장 큰 갭 (Critical)

프로젝트에 **단위 테스트 파일이 0개**이다. Jest/Vitest 설정도 없고, 모든 패키지의 `test` 스크립트가 `echo "No tests"`로 되어 있다.

- `scripts/e2e-chat-citation.mjs`, `scripts/test-notion-client.mjs`는 수동 스모크 스크립트일 뿐, 자동화된 테스트 프레임워크가 아님.
- 요구사항(`testingAndRelease.md`)에 명시된 단위/통합/E2E 테스트가 거의 미구현:
  - block normalize 변환 로직 단위 테스트 없음
  - chunking 경계/overlap/tokenCount 검증 없음
  - citation formatter/validator 테스트 없음
  - provider error mapping 테스트 없음
  - Qdrant upsert/search/filter 통합 테스트 없음

### 대응 방안
- Vitest 도입 (모노레포 + TypeScript 호환성 최적)
- 핵심 패키지(`retrieval`, `prompts`, `llm-provider`, `notion-client`) 단위 테스트 우선 작성
- CI 파이프라인(`ci.yml`)에 실제 테스트 실행 연결

---

## 2. 보안 취약점 (Critical)

### 2-1. 암호화 키가 APP_TOKEN에서 파생
- **위치**: `packages/db/src/crypto.ts:8`
- **문제**: `getKey()`가 `process.env.APP_TOKEN ?? "change-me"`에서 SHA-256으로 키를 파생한다. APP_TOKEN이 기본값이면 사실상 암호화가 무력화된다. 또한 인증 토큰과 암호화 키를 같은 값에서 파생하는 것은 보안 분리 원칙에 위배된다.
- **대응**: 전용 `ENCRYPTION_KEY` 환경변수를 분리하고, `.env.example`에 추가한다.

### 2-2. Gemini API 키가 URL 쿼리파라미터에 노출
- **위치**: `packages/llm-provider/src/geminiProvider.ts:44,91`
- **문제**: `?key=${encodeURIComponent(this.apiKey)}`로 API 키가 URL에 포함된다. 서버 로그, 프록시, 리퍼러 헤더에 키가 남을 수 있다.
- **대응**: Gemini API가 쿼리파라미터 방식을 공식 지원하므로 즉시 위험은 아니지만, 프록시/로그 정책을 점검하고, 가능하면 `x-goog-api-key` 헤더 방식으로 전환한다.

### 2-3. 인증 가드에 타이밍 공격 취약점
- **위치**: `apps/api/src/auth/auth.guard.ts:20`
- **문제**: `token !== expected` 단순 문자열 비교로 타이밍 공격에 취약하다.
- **대응**: `crypto.timingSafeEqual()` 사용으로 전환한다.

### 2-4. 입력 검증 범위 제한
- **문제**: Zod 파싱이 chat 엔드포인트에만 적용되어 있다. source/target/ingest 등의 입력 검증 수준이 불확실하다.
- **대응**: 모든 엔드포인트에 대해 `@notion-wiki/contracts`의 Zod 스키마를 통한 입력 검증을 적용한다.

---

## 3. 코드 구조/아키텍처 (Major)

### 3-1. App.tsx 단일 파일 639줄
- **위치**: `apps/web/src/App.tsx`
- **문제**: 전체 웹 앱이 하나의 파일에 들어 있다. 로그인 폼, 채팅 스레드, 토스트, citation 인스펙터, 설정 모달, API fetch 등이 분리되지 않았다.
- **대응**: 컴포넌트 추출 (`LoginForm`, `ChatThread`, `CitationInspector`, `ToastStack`, `SettingsModal`, `useWorkspace` hook 등)

### 3-2. chat.service.ts 552줄
- **위치**: `apps/api/src/chat.service.ts`
- **문제**: 하이브리드 검색, RRF fusion, diversity limit, lexical matching, session 관리, retrieval logging이 하나의 서비스에 모두 존재한다.
- **대응**: retrieval 전략 로직을 `packages/retrieval`로 분리하거나, 최소한 `HybridRetriever` 클래스로 추출한다.

### 3-3. NestJS DI 미활용
- **위치**: `ChatService`, `IngestWorkerService`
- **문제**: `new GeminiProvider()`, `new QdrantClient()`를 직접 생성한다. NestJS의 DI 컨테이너를 활용하지 않아 테스트 시 mock 주입이 어렵다.
- **대응**: Provider/QdrantClient를 NestJS provider로 등록하고, 생성자 주입으로 변경한다.

### 3-4. Prisma 직접 import
- **문제**: 모든 서비스가 `prisma` 싱글턴을 직접 import한다. 트랜잭션 관리나 테스트 격리가 어렵다.
- **대응**: `PrismaService`를 NestJS provider로 등록하고 DI로 주입한다.

---

## 4. 검색/RAG 품질 (Major)

### 4-1. Chunking이 지나치게 단순
- **위치**: `packages/retrieval/src/chunking.ts`
- **문제**:
  - 토큰 수 추정이 `length / 4`이다. 한국어/혼합 텍스트에서 부정확하다.
  - Heading 기반 1차 분할이 없다. 요구사항 `pipelines.md`에는 "1차: Heading 단위 섹션, 2차: 토큰 길이 기준"으로 명시되어 있다.
- **대응**: Heading 기반 섹션 분리를 1차로 적용하고, 한국어 토큰 추정을 보정한다 (한국어 1글자 ≈ 1~2 tokens).

### 4-2. Normalize가 제한적
- **위치**: `packages/retrieval/src/normalize.ts`
- **문제**: `paragraph`, `heading_*`, `bulleted_list_item`, `numbered_list_item`만 처리한다. `to_do`, `toggle`, `callout`, `quote`, `code`, `table`, `bookmark`, `embed`, `image caption`, `divider`, `column_list`, `synced_block` 등은 모두 무시된다.
- **대응**: 지원 블록 타입을 확장한다. 특히 `to_do`, `code`, `callout`, `quote`는 팀 지식 문서에 빈번하다.

### 4-3. Redis retrieval 캐시 미구현
- **상태**: `M2-12` pending
- **문제**: `cacheHit`는 항상 `false`로 기록된다. NFR-PERF-001의 "캐시 히트 P95: 1초 내" 목표를 달성할 수 없다.

### 4-4. MMR/Contextual Compression 미구현
- **상태**: `FR-CHAT-003` (P1) 미착수
- **문제**: 동일 문서에서 유사 chunk가 중복 반환될 수 있다. 현재 `applyDocumentDiversityLimit`으로 부분 대응하지만, MMR 수준의 다양성 보장이 아니다.

---

## 5. 에러 처리/복원력 (Major)

### 5-1. Qdrant stale point 미삭제
- **위치**: `apps/worker/src/worker.service.ts:368-375`
- **문제**: 문서 재인덱싱 시 MySQL의 stale chunk는 `deleteMany`로 삭제하지만, Qdrant의 대응 point는 삭제하지 않는다. 시간이 지나면 벡터 스토어에 고아 데이터가 쌓여 검색 품질이 저하된다.
- **대응**: MySQL stale chunk 삭제 직전에 해당 chunkId들의 Qdrant point도 삭제한다.

### 5-2. Worker 동시성 1
- **위치**: `apps/worker/src/worker.service.ts:106`
- **문제**: `concurrency: 1`이다. 대량 문서 인덱싱 시 병목이 된다.
- **대응**: concurrency를 설정 가능하게 하되, Notion rate limit (3 req/s)을 초과하지 않도록 limiter와 연동한다.

### 5-3. Embedding 배치 크기 제한 없음
- **위치**: `apps/worker/src/worker.service.ts:282-285`
- **문제**: 모든 chunk를 한 번에 `embed()` 호출한다. 문서가 매우 큰 경우(수십 개 chunk) Gemini API의 batch 제한에 걸릴 수 있다.
- **대응**: chunk를 일정 크기(예: 20개)로 분할하여 배치 임베딩한다.

### 5-4. 전역 에러 핸들러 부재
- **문제**: API에 NestJS exception filter가 없어 예상치 못한 에러가 raw stack trace로 노출될 수 있다.
- **대응**: 전역 `AllExceptionsFilter`를 추가하여 일관된 에러 응답 포맷을 보장한다.

---

## 6. 운영/관측 미완성 항목 (Moderate)

| 업무번호 | 항목 | 상태 |
|---|---|---|
| M3-01 | Admin 대시보드 카운트 API | todo |
| M3-05 | 관측 메트릭 패널 (P50/P95, cache hit, 429 count) | todo |
| M3-07 | 보안 점검 체크리스트/검증 결과 문서화 | todo |
| M3-08 | 장애 런북 (429/5xx/Qdrant 다운 대응) | todo |
| M3-09 | 릴리스 체크리스트 + smoke test 스크립트 | todo |
| M3-12 | 안정화 버그픽스 (수동 QA 항목 3개 미완) | in_progress |

### 추가 관측 갭
- Prometheus/StatsD 같은 메트릭 export가 없다. `packages/observability`에 로거만 존재한다.
- 분산 트레이싱 (request ID 전파)이 없다.

---

## 7. 프론트엔드 (Moderate)

### 7-1. CSS 파일 단일
- **위치**: `apps/web/src/styles.css` (11KB+)
- **문제**: 컴포넌트별 스타일 분리 없음. 유지보수 어려움.

### 7-2. 상태 관리 과부하
- **위치**: `apps/web/src/App.tsx`
- **문제**: `useState` 15개 이상이 한 컴포넌트에 존재한다. Context나 상태 라이브러리 없음.

### 7-3. Streaming 미지원
- **문제**: chat 응답이 전체 완료까지 기다린 후 한 번에 표시된다. Gemini의 streaming API를 활용하지 않아 긴 응답 시 UX 저하.

### 7-4. 접근성 수동 검증 미완
- **위치**: `docs/ai/ui-qa-checklist.md` C섹션
- **미완 항목**:
  - 브라우저 hotkey 충돌 확인
  - 모바일 너비 overflow 확인
  - 라이브 데이터 기반 citation open 동작 확인

---

## 8. Lint/Format 미설정 (Minor)

- 모든 패키지의 `lint`와 `format` 스크립트가 비활성 상태이다.
- ESLint, Prettier 설정 파일이 프로젝트에 존재하지 않는다.
- CI(`ci.yml`)에서 lint를 실행하지만 실제로는 아무 것도 검사하지 않는다.

---

## 우선순위 요약

| 우선도 | 항목 | 근거 |
|---|---|---|
| **P0-Critical** | 테스트 프레임워크 + 핵심 단위 테스트 | 코드 품질 보증의 기반, 모든 변경의 안전망 |
| **P0-Critical** | 보안 수정 (암호화 키 분리, timing-safe auth) | 운영 배포 전 필수 |
| **P0-Critical** | Qdrant stale point 정리 | 검색 품질 저하 누적 방지 |
| **P1-Major** | Normalize 블록 타입 확장 | 인덱싱 누락 감소, 팀 지식 검색 정확도 |
| **P1-Major** | Heading 기반 1차 chunking | 요구사항 명시, 검색 정확도 향상 |
| **P1-Major** | App.tsx / chat.service.ts 모듈 분리 | 유지보수성, 테스트 가능성 |
| **P1-Major** | ESLint/Prettier 설정 | 코드 일관성, CI 실효성 |
| **P1-Major** | 전역 exception filter | 보안 (stack trace 노출 방지) |
| **P2-Moderate** | Redis 캐시 (M2-12) | 성능 목표 달성 |
| **P2-Moderate** | 메트릭 패널/런북 (M3-05,08) | 운영 안정성 |
| **P2-Moderate** | Chat streaming | UX 개선 |
| **P2-Moderate** | 프론트엔드 컴포넌트/상태 분리 | 장기 유지보수성 |

---

## 참고: 잘 되어 있는 부분

- 모노레포 구조와 패키지 분리가 명확하다 (9개 패키지, 역할 분리)
- Notion API 연동(pagination, rate limit, retry, unsupported block skip)이 견고하다
- Citation 강제 로직과 fallback 체인이 요구사항대로 구현되어 있다
- 하이브리드 검색(semantic + lexical + RRF fusion + diversity cap)이 이미 구현되어 있다
- 인덱싱의 page-level error isolation으로 partial failure 대응이 가능하다
- Qdrant collection/index bootstrap의 idempotency가 보장되어 있다
- 문서화(requirements, research, plan, worklog)가 체계적으로 관리되고 있다
