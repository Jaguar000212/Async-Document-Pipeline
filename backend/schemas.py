from __future__ import annotations
import datetime
from typing import Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    status: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class DocumentResultSchema(BaseModel):
    extracted_data: Optional[Dict[str, Any]] = None
    is_finalized: bool = False
    updated_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentResponse):
    result: Optional[DocumentResultSchema] = None


class DocumentCreateResponse(BaseModel):
    id: UUID
    filename: str
    status: str

    model_config = {"from_attributes": True}


class UploadDocumentsResponse(BaseModel):
    documents: list[DocumentCreateResponse]

    model_config = {"from_attributes": True}


class FinalizeUpdate(BaseModel):
    """
    Payload used to finalize/update the extraction result.
    - extracted_data: provide the finalized JSON extraction (partial or full)
    - is_finalized: set to true to mark finished
    """
    extracted_data: Optional[Dict[str, Any]] = Field(default=None, description="Finalized extraction JSON")
    is_finalized: Optional[bool] = Field(default=True, description="Whether this result is finalized")


