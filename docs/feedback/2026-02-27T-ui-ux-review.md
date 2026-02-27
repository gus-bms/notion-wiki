# UI/UX Review Feedback (2026-02-27)

> Scope: `apps/web/src/App.tsx` (639 LOC) + `apps/web/src/styles.css` (690 LOC) + `index.html`
> 기준 문서: `docs/ai/ui-direction.md` (Combo A), `docs/ai/research.md` (UX Pivot 요청)
> Reviewer: AI Agent (Claude)

---

## A. 정보 구조 (Information Architecture)

### A-1. 화면 모드가 2개뿐 — 중간 상태 부재
- **현재**: `bootstrapping` → `!hasSource`(로그인) 또는 `hasSource`(채팅)
- **문제**: 아래 중간 상태에 대한 전용 화면이 없다:
  - Source는 있지만 Target이 0개 → 경고 callout만 표시
  - Target은 있지만 인덱싱된 문서가 0개 → 안내 callout만 표시
  - 인덱싱 진행 중 → 상태 chip에 "running"만 표시
- **영향**: 신규 사용자가 "연결 → 디스커버리 → 인덱싱 → 채팅"의 4단계 온보딩 흐름을 직관적으로 이해하기 어렵다.
- **제안**: Stepper/Progress indicator를 도입하여 현재 setup 단계를 시각적으로 표시한다. 각 단계별 CTA를 명확히 한다.

### A-2. 세션 관리가 숨겨져 있음
- **현재**: 헤더의 "New session" 버튼으로만 세션을 초기화한다. 이전 세션 목록을 볼 수 없다.
- **문제**: 사용자가 이전 대화를 다시 참조할 수 없다. `ChatSession`/`ChatMessage`가 DB에 저장되지만 UI에서 접근 불가.
- **제안**: 사이드바 또는 드롭다운으로 세션 히스토리를 노출한다.

### A-3. 관리자 기능 접근 경로 부족
- **현재**: "Workspace settings" 모달에서 토큰 변경 + incremental sync만 가능하다.
- **문제**: full sync 실행, job 상태 확인, target 관리, feedback 조회 등 admin 기능에 UI에서 접근할 수 없다. API는 존재하지만 프론트에서 사라졌다.
- **제안**: Settings 모달 내에 탭(Credentials / Targets / Jobs / Diagnostics)을 추가하거나, 별도 admin 경로(`/admin`)를 제공한다.

---

## B. 레이아웃 / 반응형 (Layout & Responsive)

### B-1. 채팅 영역 높이 고정 문제
- **위치**: `.thread-list { max-height: 58vh }`, `.thread-panel { min-height: 74vh }`
- **문제**: `vh` 기반 고정 높이가 다양한 화면/브라우저 환경에서 문제를 일으킨다.
  - 모바일 브라우저의 주소창/툴바로 인해 `vh` 값이 실제 가시 영역보다 큰 경우가 있다.
  - 짧은 대화에서도 74vh 공간이 강제로 확보되어 불필요한 빈 공간이 생긴다.
- **제안**: `dvh`(dynamic viewport height) 또는 `flex-grow` 기반 레이아웃으로 전환한다. 대화 목록은 내용에 따라 자연스럽게 늘어나다가 일정 높이 이후 스크롤되도록 한다.

### B-2. Citation 패널이 항상 74vh 차지
- **위치**: `.citation-panel { min-height: 74vh }`
- **문제**: Citation을 선택하지 않은 상태에서도 큰 빈 공간이 존재한다. "Select a citation..." 텍스트만 보이는 큰 패널은 공간 낭비이다.
- **제안**: Citation 미선택 시 패널을 축소하거나 숨기고, citation 선택 시 슬라이드/확장한다. 또는 모바일에서는 바텀시트 패턴을 사용한다.

### B-3. 1080px 이하에서 레이아웃 전환이 거칠다
- **위치**: `@media (max-width: 1080px) { .chat-layout { grid-template-columns: 1fr } }`
- **문제**: 2-column에서 1-column으로 즉시 전환된다. Citation 패널이 채팅 아래에 쌓여서 스크롤 없이는 보이지 않는다.
- **제안**: 태블릿 범위(768~1080px)에서는 citation 패널을 접을 수 있는 사이드 드로어로 전환한다.

### B-4. `min-width: 540px` 강제
- **위치**: `.chat-layout { grid-template-columns: minmax(540px, 1.65fr) ... }`
- **문제**: 540px 미만 뷰포트에서 채팅 패널이 화면을 넘칠 수 있다.
- **제안**: `minmax(0, 1.65fr)` 또는 미디어 쿼리로 작은 화면에서는 `min-width`를 제거한다.

---

## C. 인터랙션 / UX 패턴 (Interaction Design)

### C-1. Chat 자동 스크롤 미구현
- **위치**: `App.tsx` — `setChatHistory` 후 스크롤 로직 없음
- **문제**: 새 메시지가 추가되어도 스레드가 자동 스크롤되지 않는다. 대화가 길어지면 사용자가 수동으로 스크롤해야 한다.
- **제안**: `useEffect`에서 새 메시지 추가 시 thread-list의 `scrollTop`을 맨 아래로 이동한다. `scrollIntoView({ behavior: 'smooth' })` 사용.

### C-2. Enter 키로 전송 불가
- **위치**: composer는 `<textarea>`이며 `onKeyDown`에서 Enter 처리 없음
- **문제**: `Ctrl/Cmd+Enter`만 전송을 지원한다. 대부분의 채팅 앱에서 `Enter`로 전송, `Shift+Enter`로 줄바꿈이 기본이다.
- **제안**: `Enter`=전송, `Shift+Enter`=줄바꿈 패턴을 기본으로 제공한다. 설정으로 토글 가능하게 한다.

### C-3. Loading 상태 피드백 부족
- **현재**: "Asking..." 텍스트만 버튼에 표시된다.
- **문제**: LLM 응답이 수 초 걸리는데, 진행 상태를 알 수 없다. 사용자가 응답이 오고 있는지 멈춘 건지 판단할 수 없다.
- **제안**:
  - 스켈레톤 메시지 bubble을 먼저 표시 ("Thinking..." 애니메이션)
  - 경과 시간 카운터 표시
  - 장기(5초+) 지연 시 "Still working..." 안내

### C-4. 오류 시 재시도 경로 없음
- **현재**: chat 실패 시 토스트만 표시되고, 실패한 질문이 사라진다.
- **문제**: 사용자가 같은 질문을 다시 타이핑해야 한다.
- **제안**: 실패한 메시지를 스레드에 에러 상태로 표시하고, "Retry" 버튼을 제공한다.

### C-5. 토스트 접근성 개선 필요
- **현재**: `aria-live="polite"`, `role="alert"/"status"` 적용되어 있다.
- **개선점**:
  - dismiss 버튼의 레이블이 텍스트 `x`이다 → 스크린 리더에서 "엑스"로 읽힌다. `aria-label="Dismiss"` 있지만 시각적으로 아이콘이면 더 낫다.
  - 토스트 자동 소멸(4.5초)이 너무 짧을 수 있다. 에러 토스트는 수동 dismiss까지 유지하는 것이 좋다.
  - 토스트 최대 5개 제한은 적절하나, 같은 메시지 중복 방지 로직이 없다.

### C-6. 모달 포커스 트랩 미구현
- **위치**: `.settings-backdrop` — `role="dialog" aria-modal="true"` 선언만 있음
- **문제**: 실제 포커스 트랩이 구현되지 않았다. Tab 키를 누르면 모달 뒤의 요소로 포커스가 이동한다.
- **제안**: `FocusTrap` 컴포넌트를 구현하거나, `@radix-ui/react-dialog` 등 접근성 라이브러리를 사용한다.

---

## D. 비주얼 디자인 (Visual Design)

### D-1. 색상 단조로움
- **현재**: 파란색 계열(primary `#0389f4`) 위주로 모든 UI 요소가 구성되어 있다. bubble-user, bubble-assistant, citation-pill, callout-info가 모두 파란색 배리에이션이다.
- **문제**: 사용자 메시지와 AI 응답의 시각적 구분이 약하다. 두 bubble의 배경색 차이가 `#f2f7ff` vs `#f7faff`로 거의 구별되지 않는다.
- **제안**:
  - AI 응답에 다른 계열 색상(예: 연한 보라/회색) 적용
  - 사용자 메시지에는 좀 더 뚜렷한 배경색 사용
  - citation pill은 출처 문서 특성에 따라 색상 변화를 줄 수 있다

### D-2. 타이포그래피 위계가 불명확
- **현재**: 제목(`h1`, `h2`, `h3`)의 크기 차이가 크지 않다 (2rem → 1.34rem → 1rem).
- **문제**: header h1(2rem)과 thread-head h2(1.34rem), citation-panel h2(1.2rem)의 차이가 미묘해서 시각적 위계가 약하다.
- **제안**: 제목 레벨 간 최소 0.25rem 이상의 차이를 두고, weight 변화도 함께 적용한다.

### D-3. 빈 상태(Empty State) 디자인 부족
- **현재**: `empty-thread`에 텍스트만 있다. Citation 패널 빈 상태도 텍스트 한 줄이다.
- **제안**: 일러스트레이션 또는 아이콘 + 명확한 CTA 버튼을 포함한 empty state 디자인을 적용한다. 특히 첫 사용자 경험에서 중요하다.

### D-4. 다크 모드 미지원
- **현재**: CSS 변수가 라이트 모드만 정의되어 있다. `prefers-color-scheme` 미디어 쿼리 없음.
- **제안**: MVP 이후 우선순위로 다크 모드를 지원한다. CSS 변수 구조가 이미 있으므로 전환이 어렵지 않다.

---

## E. 성능 / 기술적 UX (Performance UX)

### E-1. Streaming 미지원
- **현재**: `/chat` API 호출이 전체 응답 완료 후 한 번에 렌더링된다.
- **영향**: Gemini LLM 응답이 2~6초 소요되는 동안 사용자는 빈 화면을 본다.
- **제안**: Server-Sent Events(SSE) 또는 `Transfer-Encoding: chunked`로 답변을 점진적으로 표시한다. ChatGPT/Gemini 등 주요 AI 챗봇의 표준 UX이다.

### E-2. 번들 최적화 부재
- **현재**: `App.tsx` 단일 파일이므로 코드 스플리팅이 불가능하다.
- **영향**: 초기 로드 시 전체 앱 코드를 다운로드한다.
- **제안**: React.lazy + Suspense로 Settings 모달, Citation Inspector 등을 지연 로딩한다.

### E-3. Bootstrap API 폴링 없음
- **현재**: 앱 시작 시 `/workspace/bootstrap` 1회 호출만 한다.
- **문제**: 다른 탭에서 인덱싱을 실행하거나 설정을 변경해도 현재 탭에 반영되지 않는다.
- **제안**: visibility change 이벤트에서 bootstrap를 재호출하거나, 일정 주기로 폴링한다.

---

## F. 접근성 (Accessibility)

### F-1. 키보드 네비게이션 갭
- **현재 지원**: `Ctrl/Cmd+K`(포커스), `Ctrl/Cmd+Enter`(전송), `Esc`(citation 클리어 / 설정 닫기)
- **미지원**:
  - Citation pill 간 방향키 탐색
  - Thread item 간 방향키 탐색
  - 키보드만으로 citation 선택 후 "Open source" 링크로 이동하는 경로

### F-2. ARIA 라벨 부족
- **문제점**:
  - Status chip에 `role`이 없다. 스크린 리더에서 의미를 알기 어렵다.
  - Chat thread의 user/assistant 역할 구분이 시각적으로만 되어 있다. `role="log"`, `aria-label` 등으로 보강 필요.
  - Citation pill의 `aria-pressed`는 적용되어 있으나, pill 그룹에 `role="group" aria-label="Citations"` 없음.

### F-3. lang 속성 불일치
- **위치**: `index.html` — `<html lang="en">`
- **문제**: UI 텍스트가 한/영 혼합이고, Notion 콘텐츠는 대부분 한국어이다. 스크린 리더가 잘못된 음성으로 읽을 수 있다.
- **제안**: `lang="ko"` 또는 `lang="ko-KR"`로 변경하고, 영문 전용 요소에만 `lang="en"` 지정.

### F-4. 컬러 대비 점검 필요
- **우려 항목**:
  - `.bubble-head span` — `color: #595959` on `#f2f7ff`/`#f7faff` 배경: 대비 비율 확인 필요
  - `.citation-pill small` — `color: #40678f` on `#ecf5ff` 배경: 소형 텍스트(0.78rem)는 4.5:1 이상 필요
  - `.empty-thread p` — `color: #345273` on `#f5f9ff` 배경

---

## G. ui-direction.md 대비 구현 갭

`docs/ai/ui-direction.md`에 정의된 Combo A 방향과 현재 구현의 차이:

| ui-direction.md 명세 | 현재 구현 상태 | 갭 |
|---|---|---|
| shadcn/ui Blocks 기반 레이아웃 | 순수 CSS + 직접 구현 | 컴포넌트 라이브러리 미도입 |
| Vercel AI Chatbot 인터랙션 패턴 | 기본 form submit 방식 | streaming, typing indicator 없음 |
| Radix Primitives 접근성 베이스라인 | 직접 구현 (포커스 트랩 누락 등) | 접근성 프리미티브 미사용 |
| 3-column 레이아웃 (setup, chat, citation) | 2-column (chat + citation) + 별도 login | setup 패널 제거됨 (UX pivot 반영) |
| Header: source switcher | Source 이름 chip만 표시 | 멀티 소스 전환 불가 |
| Admin Jobs Panel | UI에서 제거됨 | Settings 모달에도 없음 |
| Job table with filters | 미구현 | plan의 M3-03,M3-04에서 구현했으나 UX pivot으로 제거 |

---

## H. UX Pivot 요청 대비 구현 갭

`docs/ai/research.md`의 UX Pivot 요청과 현재 구현의 차이:

| UX Pivot 요청 | 현재 구현 상태 | 갭 |
|---|---|---|
| 메인 화면을 chat-first로 | chat-first 전환 완료 | 완료 |
| Notion setup을 DB에서 자동 로드 | bootstrap API + 자동 로드 완료 | 완료 |
| 에러/공지를 toast로 전환 | toast 시스템 구현됨 | 완료 |
| 현대적 비주얼 (thefrontendcompany 참조) | Manrope 폰트 + 그라디언트 배경 + 라운드 카드 | 기본 적용, 그러나 디자인 정교화 필요 (아래 상세) |
| Admin 컨트롤을 primary surface에서 제거 | 제거됨 | 완료, 그러나 대체 접근 경로 없음 |

### UX Pivot 후 새로 발생한 문제

1. **Admin 기능 접근 단절**: UX pivot으로 operator 패널을 제거했지만, full sync 실행/job 모니터링/target 관리를 위한 대체 경로가 없다. Settings 모달에 incremental sync만 있다.

2. **thefrontendcompany 트렌드 반영도 낮음**: 요청에서 참조한 모던 UX 트렌드(hyper-personalized onboarding, unified search/chat-first)는 아직 표면적 수준이다:
   - 개인화된 온보딩 흐름 없음 (Source name만 입력)
   - 통합 검색 바 없음 (채팅만 존재)
   - 마이크로 인터랙션/애니메이션 거의 없음 (`button:hover { translateY(-1px) }` 정도)
   - glassmorphism/neumorphism 같은 현대적 표면 처리 없음

---

## I. 우선순위 요약

| 우선도 | 항목 | 카테고리 | 사용자 영향 |
|---|---|---|---|
| **P0** | Chat 자동 스크롤 | 인터랙션 | 기본 UX 깨짐 |
| **P0** | Enter=전송, Shift+Enter=줄바꿈 | 인터랙션 | 채팅 앱 기본 기대 |
| **P0** | Loading skeleton/indicator | 인터랙션 | LLM 대기 시 불안감 |
| **P0** | 실패 시 재시도 경로 | 인터랙션 | 에러 복구 불가 |
| **P0** | lang="ko" 수정 | 접근성 | 스크린 리더 오작동 |
| **P1** | 모달 포커스 트랩 | 접근성 | 키보드 사용자 UX 깨짐 |
| **P1** | 온보딩 stepper/progress | 정보 구조 | 신규 사용자 이탈 |
| **P1** | Admin 기능 접근 경로 복원 | 정보 구조 | 운영 업무 차단 |
| **P1** | User/Assistant bubble 색상 구분 | 비주얼 | 대화 가독성 |
| **P1** | vh → dvh/flex 레이아웃 전환 | 반응형 | 모바일 레이아웃 깨짐 |
| **P1** | Citation 패널 빈 상태 축소 | 레이아웃 | 공간 낭비 |
| **P2** | Chat streaming (SSE) | 성능 UX | AI 챗봇 표준 기대 |
| **P2** | 세션 히스토리 접근 | 정보 구조 | 과거 대화 재참조 |
| **P2** | 다크 모드 | 비주얼 | 사용자 선호 |
| **P2** | 컬러 대비 검증 (WCAG AA) | 접근성 | 저시력 사용자 |
| **P2** | Empty state 일러스트레이션 | 비주얼 | 첫인상/온보딩 |

---

## J. 잘 되어 있는 부분

- **Chat-first 전환**: UX pivot 요청대로 메인 화면이 채팅 중심으로 깔끔하게 전환되었다.
- **Bootstrap 자동 로드**: DB에 source가 있으면 즉시 채팅 가능한 상태로 진입한다.
- **Toast 시스템**: success/error/warning/info 레벨 분리, `aria-live` 적용, 자동 소멸, 수동 dismiss 모두 구현됨.
- **Citation 선택/인스펙터 워크플로우**: pill 선택 → 패널에 상세 표시 → Open source 링크 흐름이 직관적이다.
- **Focus-visible 스타일**: 모든 인터랙티브 요소에 `outline: 2px solid var(--primary)` 적용.
- **반응형 브레이크포인트**: 1080px, 760px 두 단계로 레이아웃이 전환된다.
- **sr-only 유틸**: composer의 label이 시각적으로 숨겨져 있지만 스크린 리더에는 노출된다.
- **디자인 토큰 기반 CSS**: CSS 변수(`--bg`, `--primary`, `--ink` 등)로 구성되어 테마 확장이 용이하다.
- **Keyboard shortcut 기반 UX**: `Ctrl/Cmd+K`, `Ctrl/Cmd+Enter`, `Esc` 등 파워 유저 지원.
