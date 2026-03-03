# Codebase & UX Review Feedback (2026-03-03)

> Scope: 전체 `notion-wiki` 코드베이스 (apps/*, packages/*) 현황 분석
> Reviewer: AI Agent (Antigravity)
> Status: M0~M3 기본 기능 구현 및 UX Pivot 반영 완료 상태 기술 부채 점검

---

## 1. 테스트 부재 — 가장 심각한 기술 부채 (Critical)

- **상태**: 현재 코드베이스 전체에 `*.spec.ts` 또는 유닛 테스팅 프레임워크(Jest, Vitest 등) 기반의 자동화된 단위 테스트가 **단 1개도 존재하지 않습니다**.
- **문제점**: `packages/retrieval`의 청킹 로직, `packages/prompts`의 프롬프트 파싱 로직, `chat.service.ts`의 복잡한 하이브리드 검색 로직 등 핵심 코드가 수동 연동 스크립트(`e2e-chat-citation.mjs`)에만 의존하고 있습니다.
- **제안**: 즉시 단위 테스트 프레임워크(Vitest 권장)를 도입하고, 핵심 패키지에 대한 테스트 커버리지를 최소한이라도 확보해야 합니다. 로직 변경 시 회귀 버그(Regression) 발생 위험이 매우 높습니다.

---

## 2. 코드 구조 및 아키텍처 비대화 (Major)

### 2-1. 프론트엔드 모놀리스 (`App.tsx`)
- **현재**: `apps/web/src/App.tsx` 파일이 이전 639줄에서 **837줄**로 크게 증가했습니다.
- **문제점**: 상태 관리(15개가 넘는 `useState`), Chat UI, Citation Inspector 모달, 로그인, 설정, Toast 알림 등이 하나의 파일에서 모두 관리되어 유지보수가 거의 불가능해지고 있습니다.
- **제안**: 명확한 역할 기반 컴포넌트 분리가 시급합니다.
  - `components/chat/ChatThread.tsx`
  - `components/chat/Composer.tsx`
  - `components/layout/Sidebar.tsx` 또는 `Inspector.tsx`
  - `contexts/WorkspaceContext.tsx`, `contexts/ToastContext.tsx` 

### 2-2. 백엔드 서비스 거대화 (`chat.service.ts`)
- **현재**: `apps/api/src/chat.service.ts`가 **663줄**의 거대한 클래스가 되었습니다.
- **문제점**: 질문의 시제/날짜 파싱, 어휘 기반(Lexical) 타겟 추출, 의미 기반(Semantic) 검색, RRF(Reciprocal Rank Fusion) 기반 점수 합산, 다양성 및 문서 개수 제한 로직, LLM 통신 로직이 모두 하나의 파사드에 들어있습니다.
- **제안**: 검색 파이프라인(Retrieval Pipeline) 레이어를 분리해야 합니다. Lexical Matcher와 Semantic Searcher, RRF 합산기 등을 `packages/retrieval` 라이브러리 쪽 모듈로 추출하여 책임을 나누어야 합니다.

---

## 3. 검색 및 RAG 품질 버그 (High)

- **최근 식별된 버그 (`error.md` 원인 분석 파트)**:
  사용자의 질문 문자열에 `:`(콜론)이 포함될 경우 무조건 "Exact Phrase (정확한 문구) 검색"으로 간주해 의미 기반 검색과 Gemini LLM 생성을 통째로 Bypass 하는 치명적 휴리스틱 결함이 발견되었습니다. `chat.service.ts` 코드 개선 이슈가 현재 제보되어 조치를 계획 중입니다.

---

## 4. UX / UI 개선 갭 (Moderate)

- **Chat 인터랙션**: 이전 UX 피드백에서 지적된 "Enter=전송, Shift+Enter=줄바꿈" 패턴이 프론트엔드 코드에 완벽하게 자연스럽게 통합되어 있지 않고 여전히 `Ctrl/Cmd+Enter` 위주로 제어하려는 경향이 남아 있습니다.
- **Streaming UI 미지원**: 여전히 서버의 `/chat` API 응답 전체가 오기를 기다렸다가 한 번에 렌더링되므로 체감 속도(지연율)가 길어 보입니다.
- **Admin 기능 접근로 부재**: UI Pivot으로 관리 패널 요소들이 최소화되었지만 Job 상태 확인 및 디테일한 조작 등 운영/어드민 기능에 대한 Fallback 경로가 `Workspace settings` 내 부가 요소로만 남아 부족한 상태입니다.

---

## 5. 요약 및 우선순위 권고

| 순위 | 항목 | 카테고리 | 제안 액션 |
|---|---|---|---|
| **P0** | **LLM Bypass 버그 수정** | RAG 품질 | `chat.service.ts` 내 콜론(`:`) 감지 시 LLM 강제 패스 부분 수정 적용 (계획 중) |
| **P0** | **자동화 테스트 도입** | 품질 보증 | Vitest 설치 및 `notion-client`, `retrieval` 단위 테스트 뼈대 구성 |
| **P1** | **`App.tsx` 구조 분할** | 유지보수 | 프론트엔드 모듈 및 컴포넌트 폴더 분리 작업 |
| **P1** | **`chat.service.ts` 리팩토링**| 유지보수 | Lexical & RRF Searcher 분리 추출 |
| **P2** | **Chat Streaming API** | 사용자 경험 | Server-Sent Events (SSE) 기반 UI 개편 |
