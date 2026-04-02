"""Hub-kompatible Datenbank-Engine (SQLite, synchron).

Im Prototyp werden Tabellen beim Start automatisch erstellt.
SQLite-Anpassung: Synchrone Engine statt async (kein asyncpg).
"""

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Bei PyInstaller-exe: sys.executable zeigt auf die exe
_script_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent.parent

DB_PATH = Path(os.environ.get("HUB_DB_PATH", _script_dir / "hub.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)


def get_db():
    """FastAPI Dependency — liefert eine DB-Session pro Request."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def create_tables():
    """Erstellt alle Tabellen. Nur fuer Prototyp — im Hub nutzt man Alembic."""
    from core.base_model import HubBase
    import models  # noqa: F401 — registriert alle Models bei HubBase

    HubBase.metadata.create_all(bind=engine)


def drop_tables():
    """Loescht alle Tabellen. Nur fuer Entwicklung!"""
    from core.base_model import HubBase
    import models  # noqa: F401

    HubBase.metadata.drop_all(bind=engine)
