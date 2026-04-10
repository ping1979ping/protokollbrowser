"""Hub-kompatibles Basis-Model fuer alle Tabellen.

Adaptiert aus ping-hub Boilerplate (masterplan_hub_v2.3).
Unterschied: SQLite statt PostgreSQL, daher String-UUID statt native UUID.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class HubBase(DeclarativeBase):
    """Abstrakte Basisklasse fuer alle Hub-Tabellen."""
    pass


class HubMixin:
    """Mixin mit Standard-Feldern fuer alle Hub-Entitaeten.

    Verwendung:
        class Protokoll(HubBase, HubMixin):
            __tablename__ = "protokolle"
            name: Mapped[str] = mapped_column()

    Konventionen:
        - Tabellenname: {modul}_{entity_plural}
        - created_by: Im Prototyp NULL, im Hub aus JWT.
    """

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        default=None,
    )

    @classmethod
    def get_object_type(cls) -> str:
        """Gibt den object_type fuer polymorphe Verknuepfungen zurueck."""
        return getattr(cls, "OBJECT_TYPE", cls.__tablename__)
