import uuid
import json
import asyncio
from typing import AsyncGenerator

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

import redis.asyncio as aioredis
from celery import Celery

from database import engine, Base, get_db
from models import Document, DocumentResult
from schemas import (
    DocumentCreateResponse,
    DocumentResponse,
    DocumentDetail,
    DocumentResultSchema,
    FinalizeUpdate,
)
from settings import REDIS_URL, CELERY_BROKER

from sqlalchemy.orm import Session

app = FastAPI(title="Async Document Processing")
celery_client = Celery("api_client", broker=CELERY_BROKER)

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


@app.post("/api/documents", response_model=DocumentCreateResponse)
def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # For this example we only persist metadata; storing file contents is left as an exercise.
    doc = Document(filename=file.filename)
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Trigger background processing via Celery (non-blocking)
    try:
        celery_client.send_task("process_document", args=[str(doc.id)])
    except Exception:
        # If Celery isn't available we still return the queued record
        pass

    return DocumentCreateResponse(id=doc.id, filename=doc.filename, status=doc.status.value)


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


