"""Verantwortlicher — Firma/Person als Zustaendiger."""

from typing import ClassVar

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from core.base_model import HubBase, HubMixin


class Verantwortlicher(HubBase, HubMixin):
    __tablename__ = "verantwortliche"
    OBJECT_TYPE: ClassVar[str] = "verantwortlicher"

    legacy_id: Mapped[str] = mapped_column(String(255), index=True)
    kuerzel: Mapped[str] = mapped_column(String(20), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
