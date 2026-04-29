# Async Document Processing - Backend Boilerplate

This repository contains a minimal backend for an asynchronous document processing workflow using:

- FastAPI (HTTP API + SSE)
- PostgreSQL (SQLAlchemy ORM)
- Celery (background tasks)
- Redis (broker and Pub/Sub)
- Docker Compose (fully containerized - no manual setup needed!)

Files added:

- `database.py`, `models.py`, `schemas.py` - DB setup and models/schemas
- `worker.py` - Celery worker and `process_document` task that publishes progress to Redis Pub/Sub
- `main.py` - FastAPI application exposing endpoints and an SSE stream
- `docker-compose.yml` - **Complete stack**: PostgreSQL, Redis, Backend API, Celery Worker, Frontend
- `Dockerfile` - Backend container image
- `requirements.txt` - Python dependencies

## Quick Start (Docker Compose - All-in-One)

Everything is containerized! No need to install Python or manage virtual environments locally.

```fish
# Navigate to backend directory
cd backend

# Start all services (PostgreSQL, Redis, API, Worker, Frontend)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

That's it! Now you have:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **Backend API** on port 8000 (http://localhost:8000/docs for API docs)
- **Celery Worker** processing documents asynchronously
- **Frontend** on port 3000 (http://localhost:3000)

## Local Development (Optional - without Docker)

If you prefer running services locally:

1. Create `.env` from the example

```fish
cp .env.example .env
```

2. Create a virtualenv and install dependencies

```fish
python -m venv .venv
. .venv/bin/activate.fish
pip install -r requirements.txt
```

3. Run the FastAPI app

```fish
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

4. Start a Celery worker (in a separate terminal)

```fish
celery -A worker.celery_app worker --loglevel=info
```

API endpoints:

- POST /api/documents - upload a document (multipart file). Metadata is persisted and background processing is triggered.
- GET /api/documents - list documents
- GET /api/documents/{id} - get document and extraction result
- GET /api/documents/{id}/stream - SSE stream of progress events (subscribe to Redis pub/sub channel `job_{id}`)
- PUT /api/documents/{id}/finalize - update/mark the extraction result as finalized

Notes:

- This boilerplate uses `Base.metadata.create_all` for simplicity; in production use migrations (Alembic).
- The worker publishes JSON messages to Redis pub/sub; the SSE endpoint relays those messages to clients.
- For production deployments wrap services into Docker images and provide a robust process manager / supervisor.
- `main.py` queues the task by Celery task name, so importing the API app no longer imports `worker.py` and no DB connection happens at import time.

Testing:

```fish
pytest -q
```

The tests in `tests/` are unit-style and mock DB/Redis/Celery interactions, so they run without requiring Postgres/Redis containers.



