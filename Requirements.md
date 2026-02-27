# notion-wiki — Requirements (v1)

## 1. 목적
`notion-wiki`는 Notion 문서를 지식베이스로 삼아 **인덱싱(수집→정규화→청킹→임베딩→벡터저장)** 과 **RAG 질의응답(검색→근거 기반 답변 생성→출처 인용)** 을 제공하는 시스템이다.

- Backend: Node.js (NestJS)
- Frontend: React
- Storage: MySQL (메타/원문/로그), Redis (큐/캐시), Qdrant (벡터)
- LLM Vendor: Gemini API
- RAG Orchestration: LangChain (사용)

## 2. 범위(Scope)
### 2.1 In-Scope (MVP)
- Notion Integration Token 기반 연결 및 인덱싱 타겟 allowlist 관리
- Full sync 인덱싱 + Incremental sync (lastEdited 기준) 인덱싱
- RAG Q&A API + UI (검색/챗)
- 답변에 **citation(출처 링크+인용문) 강제**
- Admin UI: 인덱싱 상태/실패 로그/재시도
- 기본 피드백(👍/👎) 저장
- 최소 관측 로그(검색 topK, 사용 chunkId, 지연, 토큰/비용 추정)

### 2.2 Out-of-Scope (v1 제외)
- 멀티 테넌트 / SSO / RBAC(사용자별 문서 권한 동기화)
- Notion 자동 분류/태깅(문서 구조 재편)
- 대규모(수십만 문서) 고QPS 운영 최적화(샤딩/멀티워커 대규모 확장)
- 외부 소스(Drive/GitHub/Slack) 추가

## 3. 핵심 원칙
- **Allowlist 기반 인덱싱**: 사용자가 공유/허용한 Notion 범위만 수집한다.
- **근거 기반 응답**: 제공된 컨텍스트에서만 답변하며, 근거 없으면 “확인 불가”로 처리한다.
- **운영 가능성**: 인덱싱 실패 원인/재시도를 UI로 확인 가능해야 한다.
- **벤더 교체 가능성(중요)**: LLM/Embedding은 provider adapter로 추상화한다.

## 4. 용어(Glossary)
- Source: Notion 연결 단위(토큰/워크스페이스 설정)
- SyncTarget: 인덱싱 허용 범위(예: data_source ID / page ID)
- Document: Notion Page 단위 문서
- Chunk: Document를 청킹한 텍스트 조각
- Embedding: 텍스트→벡터 변환 결과
- Vector Store: Qdrant(Chunk 벡터 저장/검색)
- RAG: 검색 기반 생성 (Retrieval Augmented Generation)
- Citation: 출처(문서 링크/제목) + 인용문(quote) + 내부 참조키(chunkId)

## 5. 우선순위 정의
- P0: MVP 필수 (없으면 제품 성립 불가)
- P1: MVP 품질/운영 개선에 유의미
- P2: 후순위/확장

## 6. 문서 분할(저장 위치)
- `docs/requirements/functional.md`
- `docs/requirements/nonFunctional.md`
- `docs/requirements/dataModelAndApi.md`
- `docs/requirements/pipelines.md`
- `docs/requirements/testingAndRelease.md`
- `docs/requirements/llmProviderContract.md`

## 7. 시스템 컨텍스트(요약)
- Ingestion Worker: BullMQ(Redis) 기반 비동기 처리
- Notion API: pagination(100 limit), rate limit(평균 3 req/s) 준수
- Qdrant: filtered search를 위해 payload index 생성 권장
- Gemini API: embedding + generation 사용(로그/보관 정책은 운영에서 고려)

## 8. 성공 지표(초기 가이드)
- Citation 포함 응답 비율 ≥ 95%
- 샘플 질문셋 Recall@k ≥ 0.8 (k=8, 내부 50문항 기준)
- 인덱싱 잡 성공률 ≥ 98% (일시 오류는 재시도로 흡수)
- Chat P95 응답 시간(캐시 미스) 6초 내 목표(환경에 따라 조정)

## 9. 변경 이력
- v1: 초기 요구사항 정의(인덱싱 + RAG + citations + 운영 UI)
