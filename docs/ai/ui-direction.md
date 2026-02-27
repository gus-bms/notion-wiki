# notion-wiki Web UI Direction (2026-02-27)

## Scope
- Web product only (desktop-first, responsive web).
- Exclude native mobile app.
- Keep MVP scope: find + cite + ingest/admin controls.

## Final Reference Combinations

### Combo A (Recommended): Operator Console + Evidence Chat
- `shadcn/ui Blocks` for data-heavy app layouts and tables.
  - https://ui.shadcn.com/blocks
- `Vercel AI Chatbot` interaction pattern for chat flow and message ergonomics.
  - https://vercel.com/templates/ai/chatbot
- `Radix Primitives` accessibility behavior baseline (focus, keyboard, aria).
  - https://www.radix-ui.com/primitives/docs/overview/accessibility

Why this is the default:
- Matches current product needs (setup/admin + chat + citations) without over-designing.
- Fast path for implementation in React.
- Strong accessibility baseline out of the box.

### Combo B (Secondary): Docs Explorer + Command Palette
- Doc-navigation style shell for source/target/document browsing (left navigation, content center).
- `cmdk` pattern for global search and keyboard-first jump flow.
  - https://github.com/dip/cmdk

Why this is secondary:
- Better for large knowledge base exploration.
- Useful after MVP retrieval quality and logging stabilize.

## Wireframe Baseline (Desktop)

### 1) Global Shell
- Header: product name, source switcher, ingest quick actions, environment status.
- Main: 3-column layout.
  - Left: Notion setup + targets + ingest job controls.
  - Center: chat thread + compose box.
  - Right: citation inspector (selected citation details, open link, chunk id).

### 2) Notion Setup Panel
- Source form: name, token, notion version, test connection button.
- Target section: add target, auto discover, refresh, active/inactive chips.
- Guard rails:
  - Disable run ingest when target list is empty.
  - Show clear setup progress state (source created -> targets loaded -> ingest ready).

### 3) Chat Panel
- Thread list with user/assistant role separation.
- Sticky compose area with shortcut hint.
- Response card:
  - answer text
  - meta row (`topK`, retrieval ms, llm ms)
  - citations list with required schema fields
- Low-confidence state:
  - deterministic "exact phrase not found" or "insufficient evidence"
  - show top lexical/semantic matches when available.

### 4) Citation Inspector Panel
- Selected citation detail:
  - title
  - source url (open in new tab)
  - quote block
  - chunk id
- Optional action:
  - copy citation payload (`{chunkId,title,url,quote}`) for debugging.

### 5) Admin Jobs Panel
- Job table with status badge and retry action.
- Filters:
  - mode (full/incremental)
  - status
  - time range (optional)
- Empty/error states with actionable next steps.

## Visual and Interaction Rules
- Typography: keep current expressive stack (`Space Grotesk` + Korean fallback).
- Color system: retain green/neutral identity; emphasize status colors for ingest/chat states.
- Motion: only meaningful transitions (panel reveal, state changes, no decorative animation).
- Accessibility:
  - keyboard reachable controls
  - visible focus ring
  - semantic labels for all inputs/buttons
  - sufficient contrast for status badges and table text

## Implementation Mapping to plan.md Jobs
- `M2-13`: Chat thread/citation panel UI refinement.
- `M3-10`: Source setup usability improvements.
- `M3-11`: Target allowlist flow and discover UX refinement.
- `M3-03,M3-04`: Ingest run/retry controls in unified operator panel.
- `M3-12`: UI polish and stabilization buffer.

## Out of Scope for This Iteration
- Full design system package extraction.
- Complex analytics dashboards.
- Mobile-native interactions.
