"""Pydantic-Schemas fuer Protokollgruppe CRUD."""

from datetime import datetime
from pydantic import BaseModel


class ProtokolIgruppeBase(BaseModel):
    name: str = ""
    projekt_nummer: str = ""
    projekt_name: str = ""
    projekt_stammverzeichnis: str = ""
    protokollnummer: int = 0
    vorwort: str = ""
    nachwort: str = ""
    themen: str = ""
    bemerkung: str = ""


class ProtokollgruppeCreate(ProtokolIgruppeBase):
    legacy_id: str = ""


class ProtokollgruppeUpdate(BaseModel):
    name: str | None = None
    projekt_name: str | None = None
    vorwort: str | None = None
    nachwort: str | None = None
    themen: str | None = None
    bemerkung: str | None = None


class ProtokollgruppeRead(ProtokolIgruppeBase):
    id: str
    legacy_id: str
    created_at: datetime
    updated_at: datetime
    created_by: str | None = None

    model_config = {"from_attributes": True}
