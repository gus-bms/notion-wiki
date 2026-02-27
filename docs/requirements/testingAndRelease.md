# Testing & Release

## 1. Test Scope
### 1.1 Unit
- Notion block → normalized text 변환(블록 타입별)
- chunking 결과(경계/overlap/tokenCount)
- citation formatter(quote 길이/중복 처리)
- provider adapter 에러 매핑(429/5xx/timeout)

### 1.2 Integration
- Notion pagination: 100개 초과 목록 완주
- Notion 429: Retry-After 기반 backoff 동작
- Qdrant: upsert/search/filter/delete 동작
- Gemini: 429/500 재시도 정책 동작

### 1.3 E2E
- Full sync → 질문 → 답변 + citation 클릭 → 원문 확인
- 문서 수정 → Incremental sync → 최신 답변 반영
- (P1) Webhook 이벤트 → 재인덱싱 → 반영

## 2. Milestones (가이드)
- M0: repo scaffold + docker-compose + 기본 스키마
- M1: ingestion(full) end-to-end
- M2: chat(RAG) + citations
- M3: admin UI + job 관측/재시도
- M4: incremental/webhook + feedback + hardening
