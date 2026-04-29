import datetime
import uuid

import worker
from models import Document, DocumentResult, DocumentStatus


class _Query:
    def __init__(self, model, session):
        self.model = model
        self.session = session
        self.key = None

    def filter(self, condition):
        try:
            value = condition.right.value
            self.key = value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        except Exception:
            self.key = None
        return self

    def one_or_none(self):
        if self.model is Document:
            return self.session.documents.get(self.key)
        if self.model is DocumentResult:
            return self.session.results.get(self.key)
        return None


class _Session:
    def __init__(self, doc: Document | None):
        self.documents: dict[uuid.UUID, Document] = {}
        self.results: dict[uuid.UUID, DocumentResult] = {}
        if doc:
            self.documents[doc.id] = doc

    def query(self, model):
        return _Query(model, self)

    def add(self, item):
        if isinstance(item, Document):
            self.documents[item.id] = item
        if isinstance(item, DocumentResult):
            if item.id is None:
                item.id = uuid.uuid4()
            item.updated_at = datetime.datetime.utcnow()
            self.results[item.document_id] = item

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


def test_process_document_success(monkeypatch):
    doc = Document(id=uuid.uuid4(), filename="ok.pdf", status=DocumentStatus.QUEUED)
    session = _Session(doc)
    events: list[str] = []

    monkeypatch.setattr(worker, "SessionLocal", lambda: session)
    monkeypatch.setattr(worker.time, "sleep", lambda _s: None)
    monkeypatch.setattr(worker, "_publish", lambda _ch, event, _data=None: events.append(event))

    worker.process_document(str(doc.id))

    assert session.documents[doc.id].status == DocumentStatus.COMPLETED
    assert doc.id in session.results
    assert session.results[doc.id].is_finalized is False
    assert events == [
        "document_parsing_started",
        "document_parsing_completed",
        "field_extraction_started",
        "field_extraction_completed",
        "job_completed",
    ]


def test_process_document_not_found_publishes_failed(monkeypatch):
    session = _Session(None)
    events: list[tuple[str, dict | None]] = []

    monkeypatch.setattr(worker, "SessionLocal", lambda: session)
    monkeypatch.setattr(worker, "_publish", lambda _ch, event, data=None: events.append((event, data)))

    missing_id = str(uuid.uuid4())
    worker.process_document(missing_id)

    assert events
    assert events[0][0] == "job_failed"
    assert events[0][1]["message"] == "document_not_found"


def test_process_document_exception_marks_failed(monkeypatch):
    doc = Document(id=uuid.uuid4(), filename="boom.pdf", status=DocumentStatus.QUEUED)
    session = _Session(doc)
    events: list[str] = []

    def _boom(_seconds):
        raise RuntimeError("forced failure")

    monkeypatch.setattr(worker, "SessionLocal", lambda: session)
    monkeypatch.setattr(worker.time, "sleep", _boom)
    monkeypatch.setattr(worker, "_publish", lambda _ch, event, _data=None: events.append(event))

    worker.process_document(str(doc.id))

    assert session.documents[doc.id].status == DocumentStatus.FAILED
    assert "job_failed" in events

