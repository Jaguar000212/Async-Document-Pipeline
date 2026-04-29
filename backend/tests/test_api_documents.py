import datetime
import uuid

import main
from models import Document, DocumentResult, DocumentStatus


def test_upload_document_queues_celery_task(client, fake_db_session, monkeypatch):
    sent_calls: list[tuple[str, list[str]]] = []

    def _fake_send_task(task_name: str, args: list[str]):
        sent_calls.append((task_name, args))

    monkeypatch.setattr(main.celery_client, "send_task", _fake_send_task)

    response = client.post(
        "/api/documents",
        files=[
            ("files", ("invoice.pdf", b"fake-bytes", "application/pdf")),
            ("files", ("second.pdf", b"fake-bytes-2", "application/pdf")),
        ],
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["documents"]) == 2
    assert payload["documents"][0]["filename"] == "invoice.pdf"
    assert payload["documents"][1]["filename"] == "second.pdf"

    assert sent_calls
    assert len(sent_calls) == 2
    for task_name, args in sent_calls:
        assert task_name == "process_document"
        assert len(args) == 1
        assert uuid.UUID(args[0])


def test_list_documents_returns_desc_created_at(client, fake_db_session):
    older = Document(filename="old.txt", status=DocumentStatus.QUEUED)
    newer = Document(filename="new.txt", status=DocumentStatus.COMPLETED)
    older.created_at = datetime.datetime(2020, 1, 1)
    newer.created_at = datetime.datetime(2025, 1, 1)
    fake_db_session.add(older)
    fake_db_session.add(newer)

    response = client.get("/api/documents")

    assert response.status_code == 200
    docs = response.json()
    assert len(docs) == 2
    assert docs[0]["filename"] == "new.txt"
    assert docs[1]["filename"] == "old.txt"


def test_get_document_with_result(client, fake_db_session):
    doc = Document(filename="sample.txt", status=DocumentStatus.COMPLETED)
    fake_db_session.add(doc)
    result = DocumentResult(document_id=doc.id, extracted_data={"title": "T"}, is_finalized=False)
    fake_db_session.add(result)

    response = client.get(f"/api/documents/{doc.id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(doc.id)
    assert payload["result"]["extracted_data"]["title"] == "T"


def test_finalize_document_updates_result(client, fake_db_session):
    doc = Document(filename="sample.txt", status=DocumentStatus.COMPLETED)
    fake_db_session.add(doc)

    response = client.put(
        f"/api/documents/{doc.id}/finalize",
        json={"extracted_data": {"title": "Final"}, "is_finalized": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_finalized"] is True
    assert payload["extracted_data"]["title"] == "Final"


def test_retry_document_requeues_failed_job(client, fake_db_session, monkeypatch):
    sent_calls: list[tuple[str, list[str]]] = []

    def _fake_send_task(task_name: str, args: list[str]):
        sent_calls.append((task_name, args))

    monkeypatch.setattr(main.celery_client, "send_task", _fake_send_task)

    doc = Document(filename="failed.txt", status=DocumentStatus.FAILED)
    fake_db_session.add(doc)
    fake_db_session.add(DocumentResult(document_id=doc.id, extracted_data={"title": "Old"}, is_finalized=False))

    response = client.post(f"/api/documents/{doc.id}/retry")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "Queued"
    assert sent_calls and sent_calls[0][0] == "process_document"


def test_export_finalized_document_as_json_and_csv(client, fake_db_session):
    doc = Document(filename="export.txt", status=DocumentStatus.COMPLETED)
    fake_db_session.add(doc)
    fake_db_session.add(DocumentResult(document_id=doc.id, extracted_data={"title": "Exported", "category": "demo"}, is_finalized=True))

    json_response = client.get(f"/api/documents/{doc.id}/export?format=json")
    assert json_response.status_code == 200
    assert json_response.headers["content-type"].startswith("application/json")
    assert json_response.json()["title"] == "Exported"

    csv_response = client.get(f"/api/documents/{doc.id}/export?format=csv")
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "Exported" in csv_response.text


def test_stream_endpoint_relays_events(client, monkeypatch):
    async def _fake_sse_generator(_document_id: str):
        yield 'data: {"event":"document_parsing_started"}\n\n'
        yield 'data: {"event":"job_completed"}\n\n'

    monkeypatch.setattr(main, "_sse_event_generator", _fake_sse_generator)

    with client.stream("GET", "/api/documents/123e4567-e89b-12d3-a456-426614174000/stream") as response:
        body = "".join(chunk.decode() if isinstance(chunk, bytes) else chunk for chunk in response.iter_raw())

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "document_parsing_started" in body
    assert "job_completed" in body




