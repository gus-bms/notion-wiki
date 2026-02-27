# Non-Functional Requirements

## NFR-PERF — 성능/지연
### NFR-PERF-001 (P0) Chat 응답 지연 목표
- 캐시 미스 P95: 6초 내(환경에 따라 조정)
- 캐시 히트 P95: 1초 내(환경에 따라 조정)
- 측정 기준: API 서버가 응답 반환까지

### NFR-PERF-002 (P0) 벡터 검색 최적화
- Qdrant payload에 `sourceId`, `status`, `documentId`, `lastEditedAt` 등 필터 필드를 포함한다.
- filtered search 성능을 위해 자주 필터되는 필드의 payload index 생성을 수행한다.

## NFR-REL — 신뢰성/내결함성
### NFR-REL-001 (P0) 비동기 인덱싱
- 인덱싱은 Worker에서 수행하며, API는 job enqueue만 담당한다.

### NFR-REL-002 (P0) Retry/Backoff 정책
- Notion 429: Retry-After 준수 + 재시도
- Gemini 429/5xx: 지수 백오프 + 재시도(최대 N회)
- BullMQ attempts/backoff 설정으로 일관되게 운영한다.

### NFR-REL-003 (P1) Idempotency
- 동일 문서 재인덱싱 시, 기존 chunk/vector를 대체(upsert)하거나 안전하게 정리 후 재생성해야 한다.
- 기준 키: `chunkId` 또는 `(documentId, chunkIndex, contentHash)`.

## NFR-SEC — 보안
### NFR-SEC-001 (P0) Secret 관리
- Notion Token, Gemini API Key는 서버에서만 보관한다(클라이언트 노출 금지).
- 저장 시 암호화(예: KMS 또는 앱 레벨 암호화) 옵션을 고려한다.

### NFR-SEC-002 (P0) 최소 인증
- MVP는 단일 관리자 토큰(또는 서버 API Key) 기반 인증을 제공한다.

### NFR-SEC-003 (P1) Webhook 검증
- Webhook 서명/검증을 지원한다(가능한 방식에 맞춰 구현).
- MVP에서는 기능은 제공하되 환경에 따라 비활성화 가능.

## NFR-PRIV — 프라이버시/데이터 거버넌스
### NFR-PRIV-001 (P0) 외부 전송 최소화
- Gemini 호출 시 “질문 + topK chunk(필요 최소)”만 전송한다.
- 전체 문서 원문을 통째로 전송하는 동작은 금지한다.

### NFR-PRIV-002 (P0) 벤더 로그 정책 고려
- Gemini API는 정책 위반 탐지를 위해 프롬프트/컨텍스트/출력을 일정 기간 로깅할 수 있으므로,
  운영 정책(민감정보 제외, 전송 최소화, 옵션 검토)을 문서화한다.

## NFR-OPS — 운영/관측
### NFR-OPS-001 (P0) 주요 메트릭
- ingest: 처리 문서 수, 실패 수, 재시도 수, 429 횟수, 처리 시간
- chat: P50/P95 지연, cache hit rate, retrieval topK 분포, vendor error 비율

### NFR-OPS-002 (P1) 백업/복구
- MySQL: dump 또는 volume snapshot 전략 문서화
- Qdrant: snapshot 생성/복구 절차 문서화
- Redis: persistence(RDB/AOF) 운영 선택지 문서화
