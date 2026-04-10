"""Protokoll — Einzelnes Besprechungsprotokoll."""

from typing import ClassVar

from sqlalchemy import String, Integer, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from core.base_model import HubBase, HubMixin


class Protokoll(HubBase, HubMixin):
    __tablename__ = "protokolle"
    OBJECT_TYPE: ClassVar[str] = "protokoll"

    legacy_id: Mapped[str] = mapped_column(String(255), index=True)
    gruppe_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("protokollgruppen.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), default="")
    nummer: Mapped[int] = mapped_column(Integer, default=0)
    datum: Mapped[str] = mapped_column(String(30), default="")
    ort: Mapped[str] = mapped_column(String(255), default="")
    autor: Mapped[str] = mapped_column(String(255), default="")
    vorbemerkung: Mapped[str] = mapped_column(Text, default="")
    nachbemerkung: Mapped[str] = mapped_column(Text, default="")
    erledigt: Mapped[bool] = mapped_column(Boolean, default=False)
    ist_einzelprotokoll: Mapped[bool] = mapped_column(Boolean, default=False)
    erstellt: Mapped[bool] = mapped_column(Boolean, default=False)
    signatur: Mapped[str] = mapped_column(Text, default="")
    teilnehmer: Mapped[str] = mapped_column(Text, default="[]")  # JSON
    verteiler: Mapped[str] = mapped_column(Text, default="[]")  # JSON
    is_new: Mapped[bool] = mapped_column(Boolean, default=False)
