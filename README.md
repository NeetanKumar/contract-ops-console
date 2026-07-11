# Contract Operations Console

A full-stack contract lifecycle tool: upload structured contract JSON, track it through
`DRAFT → FINALIZED → ARCHIVED`, search/filter/paginate, and watch status changes update
live across browser tabs — all scoped to a selected organisation (multi-tenant, no login).

## Tech stack

- **Frontend**: React (Vite) + TypeScript + Tailwind CSS, React Router, TanStack React Query
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL via Prisma
- **Real-time**: Server-Sent Events (native `EventSource`, no Socket.IO/WebSocket library)

## Repository layout

```
backend/    Express API, Prisma schema + migrations, seed script
frontend/   Vite React SPA
```

## Setup

### Prerequisites

- Node.js 20+ and npm
- A running PostgreSQL instance (local or hosted)

### Backend

```bash
cd backend
npm install
cp .env.example .env        # then edit DATABASE_URL to point at your Postgres instance
npx prisma migrate dev      # creates the schema
npm run seed                # seeds 2 orgs / 5 contracts
npm run dev                 # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # defaults to http://localhost:4000, edit if your API differs
npm run dev                 # http://localhost:5173
```

Open the frontend URL, pick an organisation from the dropdown in the top bar, and go.

**Alternative: Docker Compose**, if you'd rather not install Node locally — see "Bonus
features → Docker / docker-compose" below for the one-command version.

## Environment variables

### `backend/.env`

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://user@localhost:5432/contract_ops_console?schema=public` |
| `PORT` | Port the API listens on | `4000` |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins | `http://localhost:5173` |

### `frontend/.env`

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Base URL of the backend API | `http://localhost:4000` |

See `backend/.env.example` and `frontend/.env.example` for copy-pasteable templates.

## Local development guide

- **Migrations**: `cd backend && npx prisma migrate dev` (creates a new migration from
  schema changes and applies it). `npx prisma migrate deploy` applies existing migrations
  without generating new ones (used in production).
- **Seed data**: `cd backend && npm run seed`. Re-running it wipes and recreates the 2
  organisations / 5 contracts (safe to re-run any time during development).
- **Running both servers**: backend on `:4000`, frontend on `:5173`, each via `npm run dev`
  in its own terminal.
- **Testing real-time updates**: open the app in two browser tabs on the same
  organisation, finalize or archive a contract in one tab, and watch the other tab's list
  (and detail page, if open on that contract) update without a manual refresh. The header
  shows a Live/Reconnecting indicator for the SSE connection state.

## Deployed URL

_TBD — see "Deployment" below; this section will be filled in once the app is deployed to
AWS, per the assignment's cloud-hosting requirement._

## Design decisions & assumptions

- **Why this stack**: React+Vite / Express / Postgres+Prisma is the assignment's
  mandated stack. Prisma was chosen over Drizzle for its migration CLI and more mature
  JSONB/enum ergonomics under a tight timeline. Prisma is pinned to v6 and TypeScript to
  v5 throughout (backend and frontend) — both had just-released major versions (Prisma 7,
  TypeScript 7) available at install time with unfamiliar/unverified behavior, and v6/v5
  are the well-established, fully-documented lines.
- **Org-scoping without full auth**: the frontend sends the selected org as an
  `X-Org-Id` header on every request. The backend never trusts it blindly — a middleware
  (`backend/src/middleware/orgScope.ts`) validates it's a real organisation UUID before
  any request proceeds, and every contract query is additionally filtered by that org id
  at the database level. Requests for a contract that exists but belongs to a different
  org return `404` (not `403`), so org existence/ownership can't be probed from outside.
- **Status workflow enforcement**: `DRAFT → FINALIZED → ARCHIVED` is a strict, one-way
  state machine (`backend/src/services/contractService.ts`). Finalize/Archive/Update/
  Delete each assert the contract's current status server-side before acting and return
  `409` on any invalid transition — the frontend only *shows* the relevant action buttons
  for the current status as a UX nicety, it isn't the source of truth.
- **Audit trail & delete semantics**: every create/update/status-change/delete writes a
  row to `contract_events`. Deleting a `DRAFT` contract is a genuine hard delete (there's
  no soft-delete flag in the schema), but the `DELETED` audit event is written *before*
  the delete and is designed to survive it: `contract_events.contract_id` uses
  `onDelete: SetNull` rather than cascade, so the event becomes a permanent,
  org-scoped ledger entry even though the contract it once pointed to is gone. (The
  per-contract `GET /:id/events` endpoint naturally 404s afterward, since the contract
  itself no longer exists — there's no UI surface left to view that trail against.)
- **Denormalized search columns**: `client_name`, `po_ref_no`, and `po_date` are stored
  both as indexed columns on `contracts` and inside the `field_data` JSONB blob. This is
  intentional (per the given schema) — indexed columns make `status`/`client_name`
  filtering fast, while `field_data` preserves the full original payload for exact
  round-tripping back to the client.
- **PDF attachments (bonus)**: allowed on a contract regardless of its status, since an
  attachment (e.g. the original signed PO) is supplementary reference material, not part
  of the versioned JSON payload the status workflow governs. Uploading/deleting one does
  not write a `contract_events` row — the audit trail is scoped to the contract's actual
  data and lifecycle, not its file attachments. Stored on local disk
  (`backend/uploads/<contract-id>.pdf`, metadata only in Postgres) — see known limitations
  below for why that's fine here but wouldn't be in a real multi-instance deployment.
- **Upload page UX**: the upload flow is a single paste/upload-JSON textarea (not a
  manually-built form with one input per field), matching the "paste/upload JSON" wording
  in the spec. Field-level validation errors returned by the server are rendered as a
  list of `field.path: message` under the textarea after submit, since validation is
  authoritative server-side.
- **Contract detail edit form**: DRAFT contracts get a structured edit form (not a raw
  JSON textarea) generated from the parsed `field_data`, including add/remove for line
  items, so edits stay schema-valid without needing to hand-edit JSON.
- **"Delete draft" in the UI**: the assignment's frontend requirements list doesn't
  explicitly mention a delete button, but the backend requires and implements
  `DELETE /api/contracts/:id` (draft-only) as a priority-1 item. A small "Delete draft"
  action was added to the detail page so that backend capability is reachable and
  testable end-to-end, rather than leaving it as an API-only feature.
- **Known limitations** (explicitly acceptable given the 1-week timeline):
  - The SSE connection map is in-memory and per-process. This assignment runs a single
    backend instance, so that's fine; a multi-instance production deployment would need
    a shared pub/sub layer (e.g. Redis) to fan out events across instances.
  - No authentication/authorization beyond org-scoping — anyone with the deployed URL and
    a valid org id can access that org's data, by design of the assignment.
  - Search is a single combined box that treats input matching a UUID shape as a
    contract-id lookup and anything else as a client-name partial match, rather than two
    separate inputs.
  - PDF attachments live on local disk, not object storage. Fine for this assignment's
    single-instance deployment target; a real production deployment on ephemeral compute
    (e.g. containers that get replaced on every deploy) would need S3 (or equivalent)
    instead, or the files would be lost on restart.

## API reference (summary)

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
| POST | `/api/contracts/:id/attachment` | Upload a PDF (multipart field `file`, any status) |
| GET | `/api/contracts/:id/attachment` | Download the PDF |
| DELETE | `/api/contracts/:id/attachment` | Remove the PDF |

All `/api/contracts*` routes require an `X-Org-Id` header (or `org_id` query param).
Full interactive documentation for every endpoint above is at `/api-docs` once the
backend is running (see "Bonus: OpenAPI/Swagger docs" below).

## Bonus features

All four suggested bonus items are implemented.

### Backend API tests

`backend/tests/` has a Vitest + Supertest suite (17 tests) covering org scoping/cross-org
`404`s, JSON schema validation errors, the full `DRAFT→FINALIZED→ARCHIVED` state machine
and its `409`s, audit trail ordering/diffing, delete semantics, search/filter/pagination,
and the PDF attachment endpoints (upload/download byte-for-byte, non-PDF rejection,
cross-org 404, delete). Vitest was used instead of Jest — this backend is ESM
(`"type": "module"`) and Vitest needs no extra ESM/TS transform config, while Jest does.

```bash
cd backend
createdb contract_ops_console_test   # one-time, separate from the dev DB
cp .env.test.example .env.test       # edit DATABASE_URL to point at the test DB
npm test
```

The suite applies migrations to the test database automatically, truncates all tables
between tests, and writes any test PDF uploads to a throwaway temp directory (not your
real `backend/uploads/`) — it never touches your dev database, seeded data, or files.

### OpenAPI / Swagger docs

`backend/openapi.yaml` documents every endpoint (including the attachment ones). With the
backend running, open **http://localhost:4000/api-docs** for interactive Swagger UI, or
fetch the raw spec at `http://localhost:4000/openapi.yaml`.

### PDF attachment upload

Each contract can have one PDF attached (see the "Design decisions" section above for the
rules). On the contract detail page, the Attachment card shows a file picker when there's
no attachment, or the filename/size as a download link plus a Remove button once one
exists. Enforced server-side: only `application/pdf` is accepted, max 10MB, and — like
every other contract endpoint — a cross-org request 404s rather than ever touching another
org's file.

### Docker / docker-compose (one-command local setup)

Both apps have a production-style multi-stage `Dockerfile` (backend: Node → slim runtime;
frontend: Vite build → nginx static serve with SPA fallback), plus a root
`docker-compose.yml` that builds and runs both, wired together, in one command. The
database is intentionally **not** containerized (per this project's setup, it uses your
existing local Postgres instance directly) — `docker-compose.yml` reaches it via
`host.docker.internal`.

```bash
cp .env.example .env   # set POSTGRES_USER to your local Postgres role (usually your OS username)
docker compose up --build
# frontend: http://localhost:8080   backend: http://localhost:4000
```

Everything above was actually built and run locally (not just written) to confirm it
works: both Dockerfiles build clean, the compose stack was brought up and smoke-tested
end-to-end against the real local Postgres instance, and the frontend container was
verified in a real browser talking to the backend container with zero console errors.
