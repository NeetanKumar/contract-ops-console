# Contract Operations Console

Multi-tenant contract lifecycle console — upload, track through
`DRAFT → FINALIZED → ARCHIVED`, search/filter, and see status changes live across tabs.

**Live app**: https://main.dswwc084lde8g.amplifyapp.com
**API docs**: https://d1gzd74qggmguf.cloudfront.net/api-docs

## Tech stack

React (Vite) + TypeScript + Tailwind · Node.js + Express + TypeScript · PostgreSQL + Prisma · SSE for real-time

## Features

- Organisation switcher, no login required
- Upload contract JSON with inline field-level validation errors
- Contract list — search by client name/ID, filter by status, backend-driven pagination with adjustable page size
- Contract detail — view, edit drafts, finalize/archive, full audit trail
- Status workflow enforced server-side (`DRAFT → FINALIZED → ARCHIVED`, invalid transitions rejected)
- Real-time status updates across open tabs via SSE
- Org-scoped data access — cross-org requests 404, never leak existence
- Light/dark mode, mobile-responsive

## Bonus

- PDF attachments per contract (S3-backed, inline preview, replace/remove)
- OpenAPI/Swagger docs at `/api-docs`
- 17 API tests (Vitest + Supertest)
- Docker + docker-compose for one-command local setup

## Setup

**Docker (fastest)**
```bash
cp .env.example .env   # set POSTGRES_USER, S3_BUCKET_NAME
docker compose up --build
# frontend: http://localhost:8080   backend: http://localhost:4000
```

**Manual**
```bash
# backend
cd backend
npm install
cp .env.example .env        # set DATABASE_URL
npx prisma migrate dev
npm run seed                # 2 orgs, 5 contracts
npm run dev                 # :4000

# frontend
cd frontend
npm install
cp .env.example .env
npm run dev                 # :5173
```

## Environment variables

| Backend | | Frontend | |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | `VITE_API_URL` | Backend base URL |
| `PORT` | default `4000` | | |
| `CORS_ORIGIN` | allowed frontend origin(s) | | |
| `S3_BUCKET_NAME` | attachments bucket | | |
| `AWS_REGION` | for the S3 client | | |

## Deployed on AWS

Amplify (frontend) · Elastic Beanstalk, single instance (backend) · CloudFront (HTTPS in
front of EB) · RDS Postgres (private) · S3 (attachments).

## Scope for scalability: getting to millions

- **Cursor-based pagination** — current `OFFSET`/`LIMIT` slows down as it grows; switch to
  keyset pagination on `(created_at, id)`.
- **Read replicas** for RDS — list/search/audit reads are the bulk of traffic, split off
  the primary.
- **Redis pub/sub for SSE** — the in-memory connection map only works single-instance;
  this is the actual scaling wall. Each instance keeps its own connections but
  publishes/subscribes to a shared channel.
- **Connection pooling** (RDS Proxy/PgBouncer) once app instances outnumber what Postgres
  can hold directly.
- **Partition `contract_events`** by time once it's the largest, ever-growing table.
- **Move off single-instance EB** to an auto-scaling group / ECS / Kubernetes behind a
  real load balancer.
- **Queue background work** (SQS + workers) instead of doing it inline in the request.
- **CDN in front of the attachments bucket** for edge-served downloads.
- **Structured logging, tracing, CI/CD** — currently manual deploys and console logs,
  fine for one person over a few days, not for an ongoing team.
