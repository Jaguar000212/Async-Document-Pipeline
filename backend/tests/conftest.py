import datetime
import sys
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

# Ensure backend/ is importable even when pytest changes import mode/root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from models import Document, DocumentResult, DocumentStatus


def _extract_uuid_from_condition(condition: Any) -> uuid.UUID | None:
    """Best-effort parser for SQLAlchemy binary expression right-hand value."""
    try:
        value = condition.right.value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))
    except Exception:
        return None


class FakeQuery:
    def __init__(self, model: type, session: "FakeSession"):
        self.model = model
        self.session = session
        self.filtered_id: uuid.UUID | None = None

    def filter(self, condition: Any):
        self.filtered_id = _extract_uuid_from_condition(condition)
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def one_or_none(self):
        if self.model is Document:
            if self.filtered_id is None:
                return None
            doc = self.session.documents.get(self.filtered_id)
            if doc is not None:
                doc.result = self.session.results.get(doc.id)
            return doc

        if self.model is DocumentResult:
            if self.filtered_id is None:
                return None
            return self.session.results.get(self.filtered_id)

        return None

    def all(self):
        if self.model is Document:
            return sorted(self.session.documents.values(), key=lambda d: d.created_at, reverse=True)
        return []


class FakeSession:
    def __init__(self):
        self.documents: dict[uuid.UUID, Document] = {}
        self.results: dict[uuid.UUID, DocumentResult] = {}

    def query(self, model: type):
        return FakeQuery(model, self)

    def add(self, item: Any):
        if isinstance(item, Document):
            if item.id is None:
                item.id = uuid.uuid4()
            if item.created_at is None:
                item.created_at = datetime.datetime.utcnow()
            if getattr(item, "updated_at", None) is None:
                item.updated_at = datetime.datetime.utcnow()
            if item.status is None:
                item.status = DocumentStatus.QUEUED
            self.documents[item.id] = item
            return

        if isinstance(item, DocumentResult):
            if item.id is None:
                item.id = uuid.uuid4()
            item.updated_at = datetime.datetime.utcnow()
            self.results[item.document_id] = item

    def commit(self):
        return None

    def refresh(self, _item: Any):
        return None

    def close(self):
        return None


@pytest.fixture
def fake_db_session():
    return FakeSession()


@pytest.fixture
def client(fake_db_session, monkeypatch):
    # Prevent startup from opening real DB connections during tests.
    monkeypatch.setattr(main.Base.metadata, "create_all", lambda *args, **kwargs: None)

    def _override_get_db():
        yield fake_db_session

    main.app.dependency_overrides[main.get_db] = _override_get_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()



