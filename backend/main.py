import csv
import io
import uuid
import json
import asyncio
from typing import AsyncGenerator, Literal

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

import redis.asyncio as aioredis
from celery import Celery
from redis import Redis

from database import engine, Base, get_db
from models import Document, DocumentResult, DocumentStatus
from schemas import (
    DocumentCreateResponse,
    UploadDocumentsResponse,
    DocumentResponse,
    DocumentDetail,
    DocumentResultSchema,
    FinalizeUpdate,
)
from settings import REDIS_URL, CELERY_BROKER

from sqlalchemy.orm import Session

app = FastAPI(title="Async Document Processing")
celery_client = Celery("api_client", broker=CELERY_BROKER)
redis_client = Redis.from_url(REDIS_URL)

# Allow any origin for demo purposes – restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Create tables if they do not exist (use migrations in production)
    Base.metadata.create_all(bind=engine)


def publish_job_event(document_id: str, event: str, data: dict | None = None):
    payload = {"event": event, "data": data}
    try:
        redis_client.publish(f"job_{document_id}", json.dumps(payload))
    except Exception:
        # best effort only
        pass


def get_file_metadata(file: UploadFile) -> tuple[int | None, str | None]:
    try:
        current = file.file.tell()
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(current)
        return size, file.content_type
    except Exception:
        return None, file.content_type


def export_row(document: Document) -> dict[str, object]:
    result = document.result
    extracted = result.extracted_data if result and result.extracted_data else {}
    row: dict[str, object] = {
        "id": str(document.id),
        "filename": document.filename,
        "status": document.status.value,
        "file_type": document.file_type,
        "file_size": document.file_size,
        "retry_count": document.retry_count,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
        "is_finalized": bool(result.is_finalized) if result else False,
    }
    for key, value in extracted.items():
        row[key] = json.dumps(value) if isinstance(value, (dict, list)) else value
    return row


@app.post("/api/documents", response_model=UploadDocumentsResponse)
def upload_documents(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    created: list[DocumentCreateResponse] = []

    for file in files:
        file_size, file_type = get_file_metadata(file)
        doc = Document(
            filename=file.filename,
            file_type=file_type,
            file_size=file_size,
            status=DocumentStatus.QUEUED,
            last_event="job_queued",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        publish_job_event(
            str(doc.id),
            "job_queued",
            {"document_id": str(doc.id), "filename": doc.filename, "file_size": doc.file_size},
        )

        try:
            celery_client.send_task("process_document", args=[str(doc.id)])
        except Exception:
            pass

        created.append(DocumentCreateResponse.model_validate(doc, from_attributes=True))

    return UploadDocumentsResponse(documents=created)


@app.get("/api/documents", response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [DocumentResponse.model_validate(d, from_attributes=True) for d in docs]


@app.get("/api/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str, db: Session = Depends(get_db)):
    try:
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid document id")

    doc = db.query(Document).filter(Document.id == doc_uuid).one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")

    # Ensure result is included
    return DocumentDetail.model_validate(doc, from_attributes=True)


@app.post("/api/documents/{document_id}/retry", response_model=DocumentDetail)
def retry_document(document_id: str, db: Session = Depends(get_db)):
    try:
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid document id")

    doc = db.query(Document).filter(Document.id == doc_uuid).one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")
    if doc.status != DocumentStatus.FAILED:
        raise HTTPException(status_code=409, detail="only failed jobs can be retried")

    if doc.result is not None:
        doc.result.extracted_data = None
        doc.result.is_finalized = False

    doc.status = DocumentStatus.QUEUED
    doc.retry_count = (doc.retry_count or 0) + 1
    doc.last_error = None
    doc.last_event = "job_queued"
    db.add(doc)
    db.commit()
    db.refresh(doc)

    publish_job_event(
        str(doc.id),
        "job_queued",
        {"document_id": str(doc.id), "retry_count": doc.retry_count},
    )

    try:
        celery_client.send_task("process_document", args=[str(doc.id)])
    except Exception:
        pass

    return DocumentDetail.model_validate(doc, from_attributes=True)


async def _sse_event_generator(document_id: str) -> AsyncGenerator[str, None]:
    channel = f"job_{document_id}"
    redis = aioredis.from_url(REDIS_URL)
    pubsub = redis.pubsub()
    await pubsub.subscribe(channel)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
            if message is None:
                # heartbeat comment to keep connection alive
                yield ": keep-alive\n\n"
                await asyncio.sleep(0.1)
                continue

            if message and message.get("type") == "message":
                data = message.get("data")
                if isinstance(data, (bytes, bytearray)):
                    text = data.decode()
                else:
                    text = str(data)

                # Forward the raw JSON payload in an SSE-friendly format
                yield f"data: {text}\n\n"

                # Optionally stop streaming when job is complete/failed
                try:
                    parsed = json.loads(text)
                    if parsed.get("event") in ("job_completed", "job_failed"):
                        break
                except Exception:
                    # swallow parse errors and continue
                    pass

        # After completion give a final heartbeat
        yield ": done\n\n"

    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await redis.close()
        except Exception:
            pass


@app.get("/api/documents/{document_id}/stream")
def stream_document_events(document_id: str):
    # SSE endpoint exposing Redis Pub/Sub messages for this document
    async def event_streamer():
        async for chunk in _sse_event_generator(document_id):
            yield chunk

    return StreamingResponse(event_streamer(), media_type="text/event-stream")


@app.put("/api/documents/{document_id}/finalize", response_model=DocumentResultSchema)
def finalize_document(document_id: str, payload: FinalizeUpdate, db: Session = Depends(get_db)):
    try:
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid document id")

    doc = db.query(Document).filter(Document.id == doc_uuid).one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")

    result = db.query(DocumentResult).filter(DocumentResult.document_id == doc.id).one_or_none()
    if result is None:
        result = DocumentResult(document_id=doc.id)
        db.add(result)

    if payload.extracted_data is not None:
        result.extracted_data = payload.extracted_data

    if payload.is_finalized is not None:
        result.is_finalized = payload.is_finalized

    db.add(result)
    db.commit()
    db.refresh(result)

    return DocumentResultSchema.model_validate(result, from_attributes=True)


@app.get("/api/documents/{document_id}/export")
def export_document(
    document_id: str,
    format: Literal["json", "csv"] = Query(default="json"),
    db: Session = Depends(get_db),
):
    try:
        doc_uuid = uuid.UUID(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid document id")

    doc = db.query(Document).filter(Document.id == doc_uuid).one_or_none()
    if not doc or not doc.result:
        raise HTTPException(status_code=404, detail="document not found")
    if not doc.result.is_finalized:
        raise HTTPException(status_code=409, detail="only finalized results can be exported")

    row = export_row(doc)

    if format == "json":
        return JSONResponse(content=row)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(row.keys()))
    writer.writeheader()
    writer.writerow(row)
    csv_text = buffer.getvalue()
    buffer.close()

    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="document-{document_id}.csv"'},
    )


