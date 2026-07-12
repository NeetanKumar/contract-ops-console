# Contract Operations Console

Multi-tenant contract lifecycle tool: upload contract JSON, move it through
`DRAFT → FINALIZED → ARCHIVED`, search/filter/paginate, and see status changes appear
live in other open tabs — scoped to a selected organisation, no login required.

**Live app**: https://main.dswwc084lde8g.amplifyapp.com
**API docs (Swagger)**: https://d1gzd74qggmguf.cloudfront.net/api-docs
**Repo**: this one. No access wall on either link — open and use directly.

---

## Requirements checklist

Every bullet from the assignment brief, and where it's satisfied.

**Frontend**
| Requirement | Where |
|---|---|
| Select an organisation | Org dropdown, top-right nav (`OrgSelector.tsx`) |
| Upload contract JSON with validation feedback | `/upload` — inline per-field errors from the server |
| List contracts with status | `/` — table (desktop) / cards (mobile) |
| Search/filter via backend API | Client name + contract ID search box, status filter — both sent as query params, not filtered client-side |
| View details, edit drafts, save | `/contracts/:id` — edit only enabled while `DRAFT` |
| Finalize / archive actions | Buttons shown only when valid for the current status |
| Audit trail on detail page | Bottom of `/contracts/:id`, oldest first |
| Real-time status updates across tabs | SSE + `EventSource`, live badge in the nav bar |

**Backend**
| Requirement | Where |
|---|---|
| Accept + validate contract JSON, store in Postgres | `POST /api/contracts`, Zod schema, field-level errors on `400` |
| Org-scoped, no cross-org access | `X-Org-Id` header validated server-side on every request; cross-org contract access returns `404` |
| Filter by status / client name (partial) / contract ID / pagination | `GET /api/contracts?status=&client_name=&contract_id=&page=&limit=` |
| Update draft contracts only | `PUT /api/contracts/:id` → `409` unless `DRAFT` |
| Enforce status workflow, reject invalid transitions | `409` on any transition other than `DRAFT→FINALIZED→ARCHIVED` |
| Delete drafts only | `DELETE /api/contracts/:id` → `409` unless `DRAFT` |
| Audit event per create/update/status-change/delete | `contract_events` table, written in the same transaction as each mutation |
| Expose event history per contract | `GET /api/contracts/:id/events` |

**Database**
| Requirement | Where |
|---|---|
| Org-scoped, efficient filtering/querying | Composite indexes on `(org_id, status)` and `(org_id, client_name)` |
| Contract payload as JSONB | `contracts.field_data` |
| `contract_events` audit table | Present, FK to both `contracts` and `organisations` |
| Real-time via WebSocket or SSE | SSE, native `EventSource`, no Socket.IO |

**Deployment**
| Requirement | Where |
|---|---|
| Deployed to AWS/Azure/GCP | AWS — see architecture table below |
| GitHub repo | This one, public, incremental commit history |
| README with setup/env vars/local dev/deployed URL | This file |

**Seed data**: 2 organisations, 5 contracts spread across all three statuses (see below).

---

## Tech stack

React (Vite) + TypeScript + Tailwind, Node.js + Express + TypeScript, PostgreSQL via
Prisma, Server-Sent Events for real-time. All mandated by the assignment; no substitutions.

## Repository layout

```
backend/    Express API, Prisma schema + migrations, seed script, Vitest suite
frontend/   Vite React SPA
examples/   Sample contract JSON for manually testing the upload flow
```

---

## Setup

### Prerequisites
- Node.js 20+ and npm
- A running PostgreSQL instance (local or hosted)

### Backend
```bash
cd backend
npm install
cp .env.example .env        # edit DATABASE_URL to point at your Postgres instance
npx prisma migrate dev      # creates the schema
npm run seed                # seeds 2 orgs / 5 contracts
npm run dev                 # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env        # defaults to http://localhost:4000
npm run dev                 # http://localhost:5173
```

Open the frontend URL, pick an organisation, and go.

**Docker alternative** — one command instead of the two above, if you'd rather not
install Node locally:
```bash
cp .env.example .env   # set POSTGRES_USER, S3_BUCKET_NAME
docker compose up --build
# frontend: http://localhost:8080   backend: http://localhost:4000
```
Database stays on your host Postgres (not containerized); the backend container reaches
it via `host.docker.internal` and reuses your `~/.aws` credentials for S3.

## Environment variables

**`backend/.env`**
| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API port (default `4000`) |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `S3_BUCKET_NAME` | S3 bucket for PDF attachments |
| `AWS_REGION` | Region for the S3 client |

**`frontend/.env`**
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL |

Templates: `backend/.env.example`, `frontend/.env.example`.

## Local development guide

- **Migrations**: `npx prisma migrate dev` (new migration + apply). `npx prisma migrate deploy` applies existing migrations without generating new ones — what production uses.
- **Seed data**: `npm run seed`, safe to re-run any time (wipes and recreates).
- **Both servers**: backend `:4000`, frontend `:5173`, each `npm run dev` in its own terminal.
- **Testing real-time**: open the app in two tabs on the same org, finalize/archive in one, watch the other update without a refresh. Nav bar shows Live/Reconnecting for the SSE connection.
- **Sample data**: `examples/sample-contract.json` for testing the upload flow.

---

## Deployed architecture (AWS)

| Piece | Service | Why |
|---|---|---|
| Frontend | Amplify Hosting | Static build, HTTPS by default, free tier covers this easily |
| Backend | Elastic Beanstalk, single instance, Docker platform | Runs the same `backend/Dockerfile` used locally; EC2 instance covered by AWS Free Tier |
| HTTPS for the backend | CloudFront in front of the EB instance | EB's own domain is HTTP-only with no load balancer to attach a cert to; Amplify is HTTPS-only and browsers block mixed content outright. CloudFront gives a free `*.cloudfront.net` HTTPS domain, caching disabled so it passes through the SSE stream untouched |
| Database | RDS for PostgreSQL | Not publicly accessible; reachable only from the backend's security group |
| PDF attachments | S3 | Private bucket, IAM policy scoped to `GetObject`/`PutObject`/`DeleteObject` on `attachments/*` only |

App Runner was the original plan for the backend, but a brand-new AWS account needs an
automatic AWS-side verification before App Runner accepts any request — switched to
Elastic Beanstalk instead, which was immediately available, deploys from the same
Dockerfile, and is free-tier eligible (App Runner isn't).

Cost at this traffic level: effectively $0 — RDS and the EB instance are within the
12-month Free Tier, CloudFront/Amplify are within their own free tiers. An AWS Budget
alert is configured as a safety net.

---

## Notable design decisions

- **Org-scoping enforced server-side, not just in the UI.** `X-Org-Id` is validated
  against real organisations before any request proceeds, and every query filters by it
  at the database level. A request for another org's contract returns `404` (not `403`)
  so existence can't be probed from outside.
- **Status workflow is a strict one-way state machine enforced in the service layer.**
  The frontend only shows relevant action buttons as a UX convenience — the backend is
  the actual source of truth and rejects any invalid transition with `409` regardless of
  what the client sends.
- **Deleting a DRAFT contract is a real hard delete, but its audit event survives it.**
  `contract_events.contract_id` uses `onDelete: SetNull` instead of cascade, so the
  `DELETED` event remains as a permanent, org-scoped ledger row even after the contract
  itself is gone.
- **`client_name`/`po_ref_no`/`po_date` are stored both as indexed columns and inside the
  JSONB payload** — indexed columns keep filtering fast, the JSONB blob preserves the
  exact original payload for round-tripping.
- **PDF attachments live in S3, not the database or local disk.** Only metadata
  (filename, size, mime type, timestamp) is in Postgres. This was originally local disk
  during development and migrated to S3 once actually deployed, since local disk on a
  single EC2 instance isn't durable across a platform update or instance replacement —
  the file would silently disappear while the database still claimed it existed.
- **A `Delete draft` button exists in the UI** even though the assignment's frontend
  bullet list doesn't explicitly call for it — the backend requires it as a priority-1
  item, so it's surfaced rather than left as an API-only capability nobody can reach.

## Known limitations

- SSE connections are tracked in-memory, per backend process. Fine for the single
  instance this runs on; a multi-instance deployment would need a shared pub/sub (e.g.
  Redis) to fan out events across instances — see Scalability below.
- No authentication beyond org-scoping, by design of the assignment — anyone with the
  URL and a valid org id can access that org's data.
- Search is one combined box: input shaped like a UUID is treated as a contract-ID
  lookup, anything else as a client-name partial match.

---

## Scope for scalability: getting to millions

Everything above is sized for a take-home assignment (a handful of orgs, a handful of
contracts each). Here's what would actually change to handle millions of contracts and
concurrent users — not hypothetical, specific to this codebase:

**Database**
- **Cursor-based pagination.** `page`/`limit` today uses `OFFSET`, which gets slower as
  the offset grows. At millions of rows, switch to keyset pagination (`WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?`) — the existing `(org_id, status)` and `(org_id, client_name)` indexes extend naturally to include a tiebreaker column.
- **Read replicas.** List/search/audit-trail reads (the majority of traffic) move to one
  or more RDS read replicas; writes stay on the primary. Requires the app to pick a
  connection based on read vs. write, which Prisma supports via multiple datasources.
- **Connection pooling at the proxy layer** (RDS Proxy or PgBouncer) once there are
  enough backend instances that direct Postgres connections become the bottleneck —
  Postgres has a hard cap on concurrent connections that horizontal app scaling will hit
  well before the database's actual query capacity does.
- **Partitioning `contract_events`** by time (monthly/quarterly range partitions) once
  it's the largest table by far (every mutation writes one row, it only grows) — keeps
  indexes small and makes old-partition archival/cold-storage trivial.

**Real-time (the actual scaling wall in the current design)**
- The in-memory `Map<orgId, Response[]>` in `sseManager.ts` only works because there's
  one backend process. The moment there's more than one (which horizontal scaling
  requires), a client connected to instance A never hears about a change committed via
  instance B. Fix: move the broadcast through Redis Pub/Sub (or SNS/EventBridge) — each
  instance still holds its own local SSE connections, but publishes/subscribes to a
  shared channel instead of broadcasting only to its own in-memory map.
- Beyond a few thousand concurrent SSE connections per instance, a managed real-time
  service (Pusher, Ably, AWS AppSync subscriptions) removes the connection-scaling
  problem entirely instead of managing it yourself.

**Backend / compute**
- Move off Elastic Beanstalk single-instance to an auto-scaling group behind a real load
  balancer (or ECS/Fargate, or Kubernetes) — the current setup has no redundancy and no
  scale-out path by design (it was the fastest unblocked option for this assignment).
- Push anything not needed to answer the request immediately onto a queue (SQS + worker
  process) — the obvious current candidate is virus-scanning/validating PDF uploads
  before they're servable, which today happens inline.
- Rate limiting / API gateway in front of the backend, so one noisy tenant can't degrade
  the others in a shared multi-tenant deployment.

**Storage & delivery**
- S3 already scales natively — no change needed there. Add a CloudFront distribution in
  front of the attachments bucket (separate from the one fronting the API) so downloads
  are served from edge locations instead of round-tripping to `us-east-1` every time.
- Amplify's static frontend is already CDN-backed and scales without any changes.

**Operability at scale**
- Structured logging + centralized aggregation (CloudWatch Logs, or ship to an ELK/Loki
  stack), plus request tracing (OpenTelemetry) — right now logs are just `console.log`
  on a single instance, which stops being debuggable the moment there's more than one.
- CI/CD (GitHub Actions) instead of the manual `zip` + `aws elasticbeanstalk` deploys
  used to get this assignment shipped — fine for one person over a few days, not for an
  ongoing team.

None of this is needed at the assignment's scale, and doing it upfront would have been
over-engineering against the brief — but the schema/index choices already made
(org-scoped composite indexes, JSONB for flexible payload + normalized columns for the
hot filter paths, S3 for binary data instead of the database) are exactly the same
choices a millions-of-rows version of this app would make. Nothing here requires
re-architecting from scratch, just adding infrastructure around what's already there.

---

## API reference

| Method | Path | Notes |
|---|---|---|
| GET | `/api/organisations` | List orgs for the selector |
| GET | `/api/organisations/:orgId/events/stream` | SSE stream of status-change events |
| POST | `/api/contracts` | Create (validates JSON, sets `DRAFT`) |
| GET | `/api/contracts` | List; `status`, `client_name`, `contract_id`, `page`, `limit` |
| GET | `/api/contracts/:id` | Detail |
| PUT | `/api/contracts/:id` | Update — `409` unless `DRAFT` |
| POST | `/api/contracts/:id/finalize` | `DRAFT → FINALIZED` — `409` otherwise |
| POST | `/api/contracts/:id/archive` | `FINALIZED → ARCHIVED` — `409` otherwise |
| DELETE | `/api/contracts/:id` | `409` unless `DRAFT` |
| GET | `/api/contracts/:id/events` | Audit trail, oldest first |
| POST | `/api/contracts/:id/attachment` | Upload a PDF (multipart field `file`) |
| GET | `/api/contracts/:id/attachment` | Download the PDF |
| DELETE | `/api/contracts/:id/attachment` | Remove the PDF |

All `/api/contracts*` routes require `X-Org-Id` (header or `org_id` query param).
Interactive docs: `/api-docs`. Raw spec: `/openapi.yaml`.

---

## Bonus items (all four implemented)

- **API tests** — `backend/tests/`, Vitest + Supertest, 17 tests: org-scoping/cross-org
  `404`s, validation errors, the full status state machine and its `409`s, audit trail,
  delete semantics, search/filter/pagination, PDF attachment upload/download/delete.
  ```bash
  cd backend
  createdb contract_ops_console_test
  cp .env.test.example .env.test
  npm test
  ```
- **OpenAPI/Swagger** — `backend/openapi.yaml`, served as Swagger UI at `/api-docs`.
- **PDF attachment upload** — per-contract, any status, `application/pdf` only, 10MB cap,
  same cross-org `404` discipline as everything else. Inline preview + replace/remove on
  the detail page.
- **Docker/docker-compose** — multi-stage `Dockerfile` for both apps, root
  `docker-compose.yml` builds and runs both together. Actually built and run locally to
  confirm it works, not just written.
