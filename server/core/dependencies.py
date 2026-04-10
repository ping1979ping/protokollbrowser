"""Hub-kompatible FastAPI Dependencies.

Auth ist ein Stub (Header-basiert). Im Hub wird das durch JWT ersetzt.
"""

import uuid
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from core.database import get_db

DbSession = Annotated[Session, Depends(get_db)]


class UserStub:
    """Simulierter User fuer den Prototyp-Betrieb."""
    def __init__(self, id: str | None, name: str):
        self.id = id
        self.name = name


def get_current_user(
    x_hub_user_id: str | None = Header(default=None),
    x_hub_user_name: str | None = Header(default=None),
) -> UserStub:
    """Auth-Stub: Liest User aus Header oder gibt Anonymous zurueck."""
    user_id = None
    if x_hub_user_id:
        try:
            uuid.UUID(x_hub_user_id)
            user_id = x_hub_user_id
        except ValueError:
            pass

    return UserStub(id=user_id, name=x_hub_user_name or "Anonym")


CurrentUser = Annotated[UserStub, Depends(get_current_user)]
