"""Protokollgruppe — Projektcontainer fuer Protokollserien."""

from typing import ClassVar

from sqlalchemy import String, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.base_model import HubBase, HubMixin


class Protokollgruppe(HubBase, HubMixin):
    __tablename__ = "protokollgruppen"
    OBJECT_TYPE: ClassVar[str] = "protokollgruppe"

    legacy_id: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    projekt_nummer: Mapped[str] = mapped_column(String(50), default="", index=True)
    projekt_name: Mapped[str] = mapped_column(String(255), default="")
    projekt_stammverzeichnis: Mapped[str] = mapped_column(Text, default="")
    protokollnummer: Mapped[int] = mapped_column(Integer, default=0)
    vorwort: Mapped[str] = mapped_column(Text, default="")
    nachwort: Mapped[str] = mapped_column(Text, default="")
    themen: Mapped[str] = mapped_column(Text, default="")
    bemerkung: Mapped[str] = mapped_column(Text, default="")
