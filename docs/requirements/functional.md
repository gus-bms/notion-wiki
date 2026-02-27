# Functional Requirements

## Epic A — Source/Target 관리

### FR-SRC-001 (P0) Notion Source 등록
- 시스템은 Notion Integration Token을 입력받아 Source를 등록해야 한다.
- 저장 시 토큰 유효성을 최소 1회 Notion API 호출로 검증해야 한다.
- Acceptance
  - 잘못된 토큰이면 HTTP 401/403에 준하는 에러로 실패 사유를 반환한다.
  - 성공 시 `sourceId`를 반환한다.

### FR-SRC-002 (P0) Notion API Version 강제
- 모든 Notion API 요청에 `Notion-Version` 헤더를 포함해야 한다.
- Acceptance
  - 헤더 누락으로 발생하는 `missing_version` 케이스를 로깅하고 재현 가능해야 한다.
  - 기본값은 설정으로 관리(예: `2025-09-03`).

### FR-TGT-001 (P0) 인덱싱 allowlist(Target) 관리
- 시스템은 인덱싱 대상 allowlist(SyncTarget)를 등록/조회/비활성화해야 한다.
- Acceptance
  - allowlist가 비어있으면 인덱싱 실행을 거부하고 명확한 메시지를 반환한다.
  - targetType은 최소 `data_source`, `page`를 지원한다.

---

## Epic B — 인덱싱(Full/Incremental/Webhook)

### FR-ING-001 (P0) Full Sync 인덱싱 잡 실행
- 시스템은 지정된 Source + Target에 대해 Full Sync 인덱싱을 수행해야 한다.
- 상세
  - Target이 data_source인 경우, 데이터 소스 엔트리(page) 목록을 pagination으로 전부 수집한다.
  - 각 page에 대해 메타(제목/URL/lastEdited/inTrash 등) + 본문(block children 재귀)을 수집한다.
  - 정규화(text) → chunking → embedding → Qdrant upsert → MySQL 메타 저장을 수행한다.
- Acceptance
  - 100개 초과 페이지/블록도 누락 없이 처리된다.
  - 작업은 API 요청 스레드에서 수행하지 않고 비동기 잡으로 수행된다.

### FR-ING-002 (P0) Notion pagination 처리
- Notion list 응답의 `has_more/next_cursor`를 사용하여 반복 호출해야 한다.
- Acceptance
  - page_size 제한(최대 100) 환경에서도 전체를 가져온다.

### FR-ING-003 (P0) Notion rate limit 대응
- 평균 3 req/s 제약을 준수해야 하며, 429 응답 시 `Retry-After`를 존중해야 한다.
- Acceptance
  - 429 발생 시 backoff 후 재시도(최대 N회)한다.
  - 과도한 동시 요청이 발생하지 않도록 Worker 수준 rate limit을 적용한다.

### FR-ING-004 (P0) Incremental Sync (증분 동기화)
- 마지막 성공 동기화 시각(`lastSyncAt`) 이후 변경된 문서만 재인덱싱해야 한다.
- 상세
  - `last_edited_time` 기반 정렬/필터(가능한 범위 내)로 대상 후보를 추출한다.
  - 변경이 없으면 skip 한다.
- Acceptance
  - 문서 수정 후 Incremental 실행 시 변경 내용이 검색/답변에 반영된다.

### FR-ING-005 (P1) Trash/삭제 상태 반영
- Notion의 `in_trash` 또는 `archived` 상태를 감지하여 내부 상태를 `deleted`로 마킹한다.
- Acceptance
  - deleted 상태 문서는 Qdrant 검색 결과에서 제외된다(필터 또는 삭제).

### FR-ING-006 (P1) Webhook 기반 재인덱싱
- Notion webhook 이벤트 수신 시 해당 entity를 재인덱싱하는 잡을 enqueue 해야 한다.
- Acceptance
  - Webhook 수신은 즉시 ACK(200)하고 실제 처리는 비동기로 수행한다.
  - 이벤트는 “변경 신호”이므로, 최신 내용은 Notion API 재조회로 확보한다.

---

## Epic C — 검색/RAG Q&A

### FR-CHAT-001 (P0) /chat 질의응답
- 시스템은 `message`를 입력받아 RAG 방식으로 답변을 생성해야 한다.
- 상세
  - query embedding 생성 → Qdrant topK 검색 → 컨텍스트 구성 → Gemini 생성 호출
- Acceptance
  - 응답은 `answer + citations[]`를 포함한다.

### FR-CHAT-002 (P0) Citation 강제
- 모든 답변은 최소 1개 citation을 포함해야 한다(근거가 있을 때).
- 근거가 부족하면 “확인 불가/추가 정보 필요”로 답변하고 citations는 빈 배열을 허용한다.
- Acceptance
  - citations 항목은 `{ chunkId, title, url, quote }`를 포함한다.
  - quote는 실제 컨텍스트 chunk에서 발췌한 1~2문장(최대 길이 제한)을 사용한다.

### FR-CHAT-003 (P1) Retrieval 옵션
- MMR(중복 감소) 옵션을 제공한다.
- Contextual Compression(질문 관련 문장만 압축/추출) 옵션을 제공한다.
- Acceptance
  - 옵션 on/off가 설정(환경변수 또는 Admin 설정)로 제어된다.

### FR-CHAT-004 (P1) 캐시
- 동일/유사 질의에 대해 retriever 결과 캐시(Redis TTL)를 제공한다.
- (옵션) 생성 답변 캐시를 제공하되 프라이버시 고려로 기본 off 가능.
- Acceptance
  - 캐시 히트 시 P95 응답 시간이 유의미하게 감소한다(로그로 측정).

---

## Epic D — Admin/운영 UI

### FR-ADM-001 (P0) 인덱싱 상태/로그 조회
- Admin UI는 source/target, 마지막 sync 시각, 문서 수, chunk 수, 벡터 수(가능하면)를 표시한다.
- Acceptance
  - 최근 ingest job 목록(상태/시작/종료/에러)을 조회 가능하다.

### FR-ADM-002 (P0) 인덱싱 실행/재시도
- Admin UI는 full/incremental 실행 및 실패 job 재시도를 제공한다.
- Acceptance
  - 재시도는 동일 job 또는 새로운 job enqueue 방식 중 하나로 일관되게 처리한다.

---

## Epic E — 피드백/관측

### FR-FB-001 (P1) 답변 피드백 저장
- 사용자 피드백(👍/👎 + 사유 선택)을 저장한다.
- Acceptance
  - messageId 기준으로 저장되고, Admin에서 집계 가능하다.

### FR-OBS-001 (P0) RAG 관측 로그
- 최소 로그: query, topK, 선택 chunkIds, 점수, 컨텍스트 토큰 수(추정), 지연(retrieval/llm) 저장
- Acceptance
  - 문제 발생 시 “왜 이 답이 나왔는지” 재구성이 가능해야 한다.
