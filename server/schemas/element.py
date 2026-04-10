"""Pydantic-Schemas fuer Protokollelement CRUD."""

from datetime import datetime
from pydantic import BaseModel


class ElementBase(BaseModel):
    protokoll_id: str
    position: str = ""
    positionstitel: str = ""
    positionstext: str = ""
    thema: str = ""
    status: int = 0
    termin: str = ""
    verantwortlicher_id: str | None = None
    verantwortlicher_name: str = ""
    bemerkung: str = ""
    erinnerung: bool = False
    wert: float = 0.0
    verweise: str = "[]"  # JSON string
    mobile_erfassung: str | None = None  # JSON string
    foto_anzahl: int = 0
    foto_pfad: str | None = None
    mobil_erfasst: bool = False
    mobil_datum: str | None = None
    mobil_user: str | None = None
    notiz: str | None = None
    info: str | None = None
    is_modified: bool = False
    is_new: bool = False


class ElementCreate(ElementBase):
    legacy_id: str = ""


class ElementUpdate(BaseModel):
    position: str | None = None
    positionstitel: str | None = None
    positionstext: str | None = None
    thema: str | None = None
    status: int | None = None
    termin: str | None = None
    verantwortlicher_id: str | None = None
    verantwortlicher_name: str | None = None
    bemerkung: str | None = None
    erinnerung: bool | None = None
    wert: float | None = None
    verweise: str | None = None
    mobile_erfassung: str | None = None
    is_modified: bool | None = None
    is_new: bool | None = None


class ElementRead(ElementBase):
    id: str
    legacy_id: str
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None

    model_config = {"from_attributes": True}
