import uuid
import datetime
import enum
from sqlalchemy import Column, String, DateTime, Enum as SAEnum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from database import Base


class DocumentStatus(enum.Enum):
    QUEUED = "Queued"
    PROCESSING = "Processing"
    COMPLETED = "Completed"
    FAILED = "Failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    filename = Column(String, nullable=False)
    status = Column(SAEnum(DocumentStatus, name="document_status"), nullable=False, default=DocumentStatus.QUEUED)
    created_at = Column(DateTime(timezone=False), default=datetime.datetime.utcnow, nullable=False)

    # One-to-one relationship to DocumentResult (optional)
    result = relationship("DocumentResult", back_populates="document", uselist=False, cascade="all, delete-orphan")


class DocumentResult(Base):
    __tablename__ = "document_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), unique=True, nullable=False)
    extracted_data = Column(JSONB, nullable=True)
    is_finalized = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=False), default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="result")

