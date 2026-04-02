"""Protokollelement — Einzelner Eintrag/Aufgabe in einem Protokoll."""

from typing import ClassVar

from sqlalchemy import String, Integer, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from core.base_model import HubBase, HubMixin


class Protokollelement(HubBase, HubMixin):
    __tablename__ = "protokoll_elemente"
    OBJECT_TYPE: ClassVar[str] = "protokollelement"

    legacy_id: Mapped[str] = mapped_column(String(255), index=True)
    protokoll_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("protokolle.id"), index=True
    )
    position: Mapped[str] = mapped_column(String(50), default="")
    positionstitel: Mapped[str] = mapped_column(Text, default="")
    positionstext: Mapped[str] = mapped_column(Text, default="")
    thema: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[int] = mapped_column(Integer, default=0)
    termin: Mapped[str] = mapped_column(String(30), default="")
    verantwortlicher_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verantwortlicher_name: Mapped[str] = mapped_column(String(255), default="")
    bemerkung: Mapped[str] = mapped_column(Text, default="")
    erinnerung: Mapped[bool] = mapped_column(Boolean, default=False)
    wert: Mapped[float] = mapped_column(Float, default=0.0)
    verweise: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    mobile_erfassung: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    foto_anzahl: Mapped[int] = mapped_column(Integer, default=0)
    foto_pfad: Mapped[str | None] = mapped_column(Text, nullable=True)
    mobil_erfasst: Mapped[bool] = mapped_column(Boolean, default=False)
    mobil_datum: Mapped[str | None] = mapped_column(String(30), nullable=True)
    mobil_user: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notiz: Mapped[str | None] = mapped_column(Text, nullable=True)
    info: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_modified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_new: Mapped[bool] = mapped_column(Boolean, default=False)
