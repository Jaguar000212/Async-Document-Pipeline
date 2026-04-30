# Backend - Async Document Processing

This backend provides an asynchronous document pipeline with:

- FastAPI for REST + SSE endpoints
- PostgreSQL via SQLAlchemy models
- Celery for background jobs
- Redis for both Celery broker and Pub/Sub progress events

The worker does the processing outside the request-response cycle. The API only creates records, queues jobs, and streams status updates.

## Project Files

- `main.py`: FastAPI routes, task enqueueing, SSE relay
- `worker.py`: Celery `process_document` task and progress publishing
- `models.py`: `Document`, `DocumentResult`, `DocumentStatus`
- `schemas.py`: Pydantic request/response models
- `database.py`: SQLAlchemy engine/session helpers
- `settings.py`: env-based settings (`DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER`)

## Run With Docker Compose (recommended)

Run from the workspace root where `docker-compose.yml` exists:

```fish
cd "Work Sample"
docker compose up -d --build
docker compose ps
```

Services:

- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- Backend API: `localhost:8000` (`/docs` available)
- Celery worker: background processing container
- Frontend: `localhost:3000`

Useful logs:

```fish
cd "Work Sample"
docker compose logs -f backend
docker compose logs -f celery-worker
```

## Run Locally (without Docker)

If Postgres and Redis are already running locally:

```fish
cd "Work Sample/backend"
cp .env.example .env
python -m venv .venv
. .venv/bin/activate.fish
pip install -r requirements.txt
alembic upgrade head
```

Terminal 1 (API):

```fish
cd "Work Sample/backend"
. .venv/bin/activate.fish
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 (worker):

```fish
cd "Work Sample/backend"
. .venv/bin/activate.fish
celery -A worker worker --loglevel=info
```

## API Surface

- `POST /api/documents`
  - Upload one or more files (`files` form field)
  - Persists metadata and status as `Queued`
  - Publishes `job_queued` and enqueues Celery task
- `GET /api/documents`
  - List documents ordered by newest first
- `GET /api/documents/{document_id}`
  - Get document detail + extracted result (if present)
- `POST /api/documents/{document_id}/retry`
  - Requeue failed jobs, increment retry count
- `GET /api/documents/{document_id}/stream`
  - SSE stream that relays Redis Pub/Sub events from `job_{document_id}`
- `PUT /api/documents/{document_id}/finalize`
  - Update reviewed `extracted_data` and mark `is_finalized`
- `GET /api/documents/{document_id}/export?format=json|csv`
  - Export finalized result only

## Progress Event Flow

Published by worker and consumed by frontend via SSE:

- `job_queued`
- `job_started`
- `document_parsing_started`
- `document_parsing_completed`
- `field_extraction_started`
- `field_extraction_completed`
- `job_completed` or `job_failed`

## Database Notes

- `documents` table stores file metadata, status, retry/error fields
- `document_results` stores extracted JSON and finalization state
- Status values are `Queued`, `Processing`, `Completed`, `Failed`

For schema changes, use Alembic migrations (see `ALEMBIC_GUIDE.md`).

## Testing

```fish
cd "Work Sample/backend"
python -m venv .venv
. .venv/bin/activate.fish
pip install -r requirements.txt
pytest -q
```

Current tests are unit-style and mock DB/Celery/Redis interactions, so they do not require running containers.
