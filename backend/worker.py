import time
import json
import uuid
from celery import Celery
from redis import Redis

from database import SessionLocal
from models import Document, DocumentResult, DocumentStatus
from settings import REDIS_URL, CELERY_BROKER

# Celery app
celery_app = Celery("worker", broker=CELERY_BROKER)

# Sync Redis client used for publishing pub/sub messages
redis_client = Redis.from_url(REDIS_URL)


def _publish(channel: str, event: str, data: dict | None = None):
    payload = {"event": event, "data": data}
    try:
        redis_client.publish(channel, json.dumps(payload))
    except Exception:
        # Best-effort publish, don't fail the task because Pub/Sub isn't available
        pass


@celery_app.task(name="process_document")
def process_document(document_id: str):
    """
    Simulated document processing pipeline. Publishes progress messages to Redis Pub/Sub
    on channel `job_{document_id}`.
    """
    channel = f"job_{document_id}"
    session = SessionLocal()
    try:
        # Load document
        doc_uuid = uuid.UUID(document_id)
        doc = session.query(Document).filter(Document.id == doc_uuid).one_or_none()
        if doc is None:
            _publish(channel, "job_failed", {"message": "document_not_found"})
            return

        # Step 1: mark processing started
        doc.status = DocumentStatus.PROCESSING
        session.add(doc)
        session.commit()
        _publish(channel, "document_parsing_started", {"document_id": document_id})

        # Simulate parsing
        time.sleep(2)
        _publish(channel, "document_parsing_completed", {"document_id": document_id})

        # Field extraction steps
        _publish(channel, "field_extraction_started", {"document_id": document_id})
        time.sleep(2)
        _publish(channel, "field_extraction_completed", {"document_id": document_id})

        # Create mock extraction data
        extracted = {
            "title": f"Mock Title for {doc.filename}",
            "category": "mock_category",
            "summary": "This is a generated mock summary of the document."
        }

        # Upsert result
        result = session.query(DocumentResult).filter(DocumentResult.document_id == doc.id).one_or_none()
        if result is None:
            result = DocumentResult(document_id=doc.id, extracted_data=extracted, is_finalized=False)
            session.add(result)
        else:
            result.extracted_data = extracted
            result.is_finalized = False
            session.add(result)

        # Mark document completed
        doc.status = DocumentStatus.COMPLETED
        session.add(doc)
        session.commit()

        _publish(channel, "job_completed", {"document_id": document_id})

    except Exception as exc:  # noqa: BLE001 - broad catch to ensure we update DB & notify
        try:
            # Attempt to mark failed in DB
            if 'doc' in locals() and doc is not None:
                doc.status = DocumentStatus.FAILED
                session.add(doc)
                session.commit()
        except Exception:
            session.rollback()
        _publish(channel, "job_failed", {"document_id": document_id, "error": str(exc)})
    finally:
        session.close()


