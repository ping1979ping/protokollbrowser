"""Pydantic-Schemas fuer Protokoll CRUD."""

from datetime import datetime
from pydantic import BaseModel


class ProtokollBase(BaseModel):
    gruppe_id: str
    name: str = ""
    nummer: int = 0
    datum: str = ""
    ort: str = ""
    autor: str = ""
    vorbemerkung: str = ""
    nachbemerkung: str = ""
    erledigt: bool = False
    ist_einzelprotokoll: bool = False
    erstellt: bool = False
    signatur: str = ""
    teilnehmer: str = "[]"  # JSON string
    verteiler: str = "[]"  # JSON string
    is_new: bool = False


class ProtokollCreate(ProtokollBase):
    legacy_id: str = ""


class ProtokollUpdate(BaseModel):
    name: str | None = None
    datum: str | None = None
    ort: str | None = None
    autor: str | None = None
    vorbemerkung: str | None = None
    nachbemerkung: str | None = None
    erledigt: bool | None = None
    signatur: str | None = None
    teilnehmer: str | None = None
    verteiler: str | None = None


class ProtokollRead(ProtokollBase):
    id: str
    legacy_id: str
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None

    model_config = {"from_attributes": True}
