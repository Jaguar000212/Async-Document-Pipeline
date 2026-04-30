# Frontend - Async Document Processing

This is a Next.js (App Router) + TypeScript frontend for the FastAPI backend.

It provides:

- Multi-file upload
- Document/job dashboard with search, status filter, and sorting
- Document detail page with live progress updates (SSE, with polling fallback)
- Review/edit/finalize flow for extracted JSON
- JSON/CSV export for finalized results

## Run With Docker Compose (recommended)

Run from the workspace root:

```fish
cd "Work Sample"
docker compose up -d --build
docker compose ps
```

Open `http://localhost:3000`.

## Run Locally

```fish
cd "Work Sample/frontend"
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

- `NEXT_PUBLIC_API_BASE_URL`: backend base URL used by `frontend/lib/api.ts`
  - default fallback in code: `http://localhost:8000`

Example:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## How It Works

- Upload posts files to `POST /api/documents`
- Dashboard reads `GET /api/documents` and auto-polls while active jobs exist
- Detail page opens EventSource to `GET /api/documents/{id}/stream`
- On stream disconnect, detail page falls back to 3s polling
- Review form sends `PUT /api/documents/{id}/finalize`
- Export buttons call `GET /api/documents/{id}/export?format=json|csv`

## Key Files

- `app/page.tsx`: dashboard shell
- `components/UploadForm.tsx`: multi-upload + redirect behavior
- `components/DocumentList.tsx`: table, search/filter/sort, retry action
- `app/documents/[id]/page.tsx`: detail page, progress state machine, SSE handling
- `components/ReviewForm.tsx`: JSON editor, finalize, export, copy
- `lib/api.ts`: typed API client + error wrapper
- `types/index.ts`: shared API and domain types


