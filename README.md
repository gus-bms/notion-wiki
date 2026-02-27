# notion-wiki

Notion document findability tool (MVP scaffold) with:
- NestJS API (`apps/api`)
- NestJS Worker (`apps/worker`)
- React Web UI (`apps/web`)
- Shared packages under `packages/*`

## Quick Start

1. Copy env file.
```bash
cp .env.example .env
```

2. Start infra.
```bash
docker compose -f infra/docker-compose.yml up -d
```

3. Install dependencies.
```bash
npm install
```

4. Generate Prisma client and apply migration (first time).
```bash
npm run db:generate
npm run db:migrate
```

5. Run API, Worker, Web.
```bash
npm run dev
```

If dev processes remain after terminal close/interruption:
```bash
npm run dev:stop
```

If web-to-api requests are blocked by CORS, set `.env`:
`CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`

Web client auth header is now injected from env:
`VITE_APP_TOKEN` (fallback: `APP_TOKEN`)

Secret encryption key is configured with:
`ENCRYPTION_KEY` (do not reuse `APP_TOKEN`)

Worker health endpoints:
- `GET http://localhost:3001/health`
- `GET http://localhost:3001/queue/ping`

## Core Endpoints

- `POST /sources/notion`
- `GET /workspace/bootstrap`
- `POST /workspace/login`
- `POST /sources/:sourceId/targets`
- `POST /sources/:sourceId/targets/discover`
- `GET /sources/:sourceId/targets`
- `POST /ingest/run`
- `GET /ingest/jobs`
- `GET /ingest/jobs/:jobId`
- `POST /ingest/jobs/:jobId/retry`
- `GET /ingest/page-failures`
- `POST /ingest/page-failures/:failureId/retry`
- `POST /chat`
- `POST /feedback`

All non-public endpoints require:
`Authorization: Bearer <APP_TOKEN>`

Notes:
- `POST /workspace/login` can auto-discover targets and queue one `full` ingest run by default.
- Target discovery includes Notion `data_source` and `page` entries (including data source child pages).
- Web settings modal includes `Run full sync` and page-level ingest failure retry actions.

## E2E Smoke (chat + citation)

Run a practical E2E smoke test for:
- target readiness check
- optional ingest run + completion wait
- chat response validation
- citation schema validation
- citation quote vs DB chunk text verification

```bash
npm run e2e:chat
```

Optional env overrides:
- `E2E_SOURCE_ID=1` (default: `1`)
- `E2E_RUN_INGEST=true|false` (default: `false`)
- `E2E_INGEST_MODE=incremental|full` (default: `incremental`)
- `E2E_INGEST_TIMEOUT_MS=900000` (default: `900000`)
- `E2E_CHAT_MESSAGE="질문 내용"` (required)
- `E2E_ALLOW_EMPTY_CITATIONS=1` (allow zero-citation case)
- `E2E_API_BASE_URL=http://localhost:3000`

Example:
```bash
E2E_CHAT_MESSAGE="다음 문장이 있는 문서 찾아줘: forcura.com" npm run e2e:chat
```

PowerShell example:
```powershell
$env:E2E_CHAT_MESSAGE="다음 문장이 있는 문서 찾아줘: forcura.com"; npm run e2e:chat
```

## Notion Client Integration Check (M1-20)

Run mock-server based integration checks for:
- pagination completion (`has_more` / `next_cursor`)
- 429 Retry-After retry behavior

```bash
npm run test:notion-client
```
