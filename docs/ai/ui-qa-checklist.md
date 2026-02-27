# notion-wiki Web UI QA Checklist (M3-12)

Date: 2026-02-27
Scope: `apps/web` operator console (setup, ingest controls, chat, citation inspector, jobs)

## A. Automated Checks

- [x] TypeScript + production build
  - Command: `npm run --workspace @notion-wiki/web build`
  - Result: pass

- [x] E2E smoke script syntax check
  - Command: `node --check scripts/e2e-chat-citation.mjs`
  - Result: pass

## B. UX/Interaction Checklist

- [x] Three-column operator layout renders and collapses at responsive breakpoints.
- [x] Setup readiness chips reflect token/source/active target/ingest-ready states.
- [x] Ingest buttons disabled when no active target exists.
- [x] Citation card selection updates inspector panel.
- [x] Selected citation has visual active state.
- [x] Keyboard shortcuts wired:
  - `Ctrl/Cmd+K` focus composer
  - `Ctrl/Cmd+Enter` send
  - `Esc` clear citation selection
  - `Alt+R` refresh state
- [x] Focus-visible outline styles exist for keyboard accessibility.

## C. Residual Manual Validation (Pending)

- [ ] Browser manual check: ensure hotkeys do not conflict with OS/IME behavior.
- [ ] Mobile-width manual check: no clipped controls around target list and jobs filters.
- [ ] End-to-end runtime check with live source data (ingest -> chat -> citation open in browser).

## D. Exit Notes

- Current state: `M3-12` is functionally stabilized in code.
- Remaining risk is runtime/manual behavior in real browser sessions and live data paths.
