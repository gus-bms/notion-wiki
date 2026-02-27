# Pipelines (Ingestion & RAG)

## 1. Ingestion Pipeline
### 1.1 Full Sync (P0)
1) Targets 조회 (data_source/page)
2) data_source target:
   - Notion query API로 page 목록 수집(pagination)
3) 각 page 처리
   - page 메타 수집(title/url/lastEdited/inTrash)
   - block children 재귀 수집 + pagination
4) 정규화(Normalize)
   - Notion block tree → “Markdown 유사 텍스트”로 변환
5) Chunking
   - 1차: Heading 단위 섹션
   - 2차: 토큰 길이 기준 분할
   - target: 700~900 tokens, overlap 100~150
6) Embedding 생성 (Gemini)
7) Qdrant upsert
   - pointId: chunkId(권장)
   - payload: sourceId, documentId, notionPageId, chunkIndex, title, url, anchor, lastEditedAt, status
8) MySQL 저장
   - Document / DocumentChunk / EmbeddingRef / indexedAt 갱신

### 1.2 Incremental Sync (P0)
- lastSyncAt 이후 변경 후보를 추출
- contentHash 비교로 변경 없으면 skip
- 변경 시 해당 문서만 재인덱싱(upsert)

### 1.3 Deletion/Trash (P1)
- in_trash=true 감지 시
  - Document.status=deleted
  - Qdrant에서 documentId 필터로 해당 chunk points 삭제 또는 status 필터로 제외

### 1.4 Worker/Queue 정책 (P0)
- BullMQ attempts/backoff 설정
- Notion rate limit을 Worker 레벨에서 제한
- 429 발생 시 Retry-After 존중

---

## 2. RAG Pipeline
1) 입력 질문 수신
2) query embedding 생성
3) Qdrant topK 검색 (k=8 기본)
   - 필터: sourceId, status=active
   - (옵션) MMR, Compression
4) Prompt context 구성
   - context item: { chunkId, title, url, text }
   - 최대 컨텍스트 길이 제한(토큰 기반)
5) Gemini generate
6) 응답 파싱
   - answer 텍스트
   - citations[] 구조화
7) 로그 저장
   - retrieval 결과, latency, 사용 chunkIds

---

## 3. Prompt 정책 (P0)
### System 규칙(요약)
- CONTEXT에 근거해서만 답한다.
- 근거 부족 시 “확인 불가”로 답한다.
- 답변에 CITATIONS 섹션을 포함한다.

### Output 포맷(권장)
- JSON 모드(가능하면) 또는 고정 텍스트 포맷으로 파싱 안정화
- citations는 `{chunkId,title,url,quote}` 강제
