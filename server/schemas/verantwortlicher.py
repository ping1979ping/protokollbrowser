"""Pydantic-Schemas fuer Verantwortlicher (read-only)."""

from datetime import datetime
from pydantic import BaseModel


class VerantwortlicherBase(BaseModel):
    kuerzel: str = ""
    name: str = ""


class VerantwortlicherRead(VerantwortlicherBase):
    id: str
    legacy_id: str
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None

    model_config = {"from_attributes": True}
