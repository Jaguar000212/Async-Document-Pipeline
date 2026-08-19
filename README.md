# Async Document Processing Work Sample
> Built originally as a take-home exercise, then extended: containerised, tested, and documented. Notes on what would need to change for production are at the bottom of this README.

This project demonstrates an end-to-end asynchronous document processing system with:

- **Frontend:** Next.js + React + TypeScript
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL
- **Background processing:** Celery
- **Messaging/progress:** Redis Pub/Sub

The request-response path only creates jobs and returns quickly. Actual processing runs in Celery workers, and progress events are streamed to the UI.

## Architecture

- **FastAPI (`backend/main.py`)**
  - Accepts uploads
  - Stores document/job metadata
  - Enqueues Celery tasks
  - Exposes SSE endpoint that relays Redis Pub/Sub events
- **Celery Worker (`backend/worker.py`)**
  - Executes multi-step processing workflow
  - Updates DB status/result
  - Publishes lifecycle events to Redis channels (`job_{document_id}`)
- **PostgreSQL (`backend/models.py`)**
  - `documents`: metadata, status, retries, errors
  - `document_results`: extracted JSON + finalization state
- **Next.js Frontend (`frontend/`)**
  - Upload UI
  - Dashboard with search/filter/sort
  - Detail page with live progress and review/finalize flow

## Key Features

- Multi-file upload
- Job states: `Queued`, `Processing`, `Completed`, `Failed`
- Near-real-time progress updates using SSE from Redis Pub/Sub
- Retry failed jobs
- Review and edit extracted JSON
- Finalize reviewed output
- Export finalized result as JSON or CSV

## Repository Structure

- `docker-compose.yml` - full local stack
- `backend/` - FastAPI, Celery worker, SQLAlchemy models, Alembic, tests
- `frontend/` - Next.js app and typed API client

## Quick Start (Docker Compose)

Run from the repository root:

```fish
cd "Work Sample"
docker compose up -d --build
docker compose ps
```

Open:

- Frontend: `http://localhost:3000`
- Backend API docs: `http://localhost:8000/docs`

Useful logs:

```fish
cd "Work Sample"
docker compose logs -f backend
docker compose logs -f celery-worker
```

## Local Development (without Docker)

See service-specific docs for full setup:

- `backend/README.md`
- `frontend/README.md`

Typical flow:

1. Start PostgreSQL + Redis
2. Run backend API
3. Run Celery worker
4. Run frontend dev server

## API Overview

Main backend routes:

- `POST /api/documents` - upload one or more documents
- `GET /api/documents` - list documents/jobs
- `GET /api/documents/{document_id}` - get details and result
- `GET /api/documents/{document_id}/stream` - stream progress (SSE)
- `POST /api/documents/{document_id}/retry` - retry failed jobs
- `PUT /api/documents/{document_id}/finalize` - save reviewed/finalized result
- `GET /api/documents/{document_id}/export?format=json|csv` - export finalized result

## Processing Lifecycle Events

Worker emits these events during processing:

- `job_queued`
- `job_started`
- `document_parsing_started`
- `document_parsing_completed`
- `field_extraction_started`
- `field_extraction_completed`
- `job_completed`
- `job_failed`

## Testing

Backend tests:

```fish
cd "Work Sample/backend"
python -m venv .venv
. .venv/bin/activate.fish
pip install -r requirements.txt
pytest -q
```

Frontend type-check:

```fish
cd "Work Sample/frontend"
npm install
npm run typecheck
```

## Notes

- Migrations are managed with Alembic (`backend/ALEMBIC_GUIDE.md`).
- In Docker Compose, backend startup runs `alembic upgrade head` before starting the API.
- Frontend API base URL is configured via `NEXT_PUBLIC_API_BASE_URL`.

