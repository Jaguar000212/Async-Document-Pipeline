# Frontend - Async Document Processing

This is a Next.js (App Router) frontend for the FastAPI async document processing backend.

## Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

- `NEXT_PUBLIC_API_BASE_URL`: Base URL for backend API (default in code: `http://localhost:8000`).

## Implemented

- `types/index.ts`: shared API/document types.
- `lib/api.ts`: typed REST client for upload/list/detail/finalize.
- `components/UploadForm.tsx`: upload UI with state + redirect.
- `components/DocumentList.tsx`: dashboard table with status badges and manual refresh.
- `app/page.tsx`: dashboard page hosting upload + jobs table.
- `app/documents/[id]/page.tsx`: detail view with SSE live progress tracker.
- `components/ReviewForm.tsx`: edit/finalize extraction JSON and export to file.


