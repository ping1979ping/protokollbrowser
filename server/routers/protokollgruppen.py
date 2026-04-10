"""Hub-konformer Router fuer Protokollgruppen."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, func

from core.dependencies import DbSession
from core.schemas import paginated_response, single_response, error_response
from models.protokollgruppe import Protokollgruppe
from schemas.protokollgruppe import ProtokollgruppeRead

router = APIRouter(prefix="/api/protokollgruppen", tags=["protokollgruppen"])


@router.get("")
def list_gruppen(
    db: DbSession,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    total = db.execute(select(func.count()).select_from(Protokollgruppe)).scalar()
    rows = db.execute(
        select(Protokollgruppe)
        .order_by(Protokollgruppe.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).scalars().all()
    items = [ProtokollgruppeRead.model_validate(r).model_dump() for r in rows]
    return paginated_response(items=items, total=total, page=page, size=size)


@router.get("/{gruppe_id}")
def get_gruppe(db: DbSession, gruppe_id: str):
    row = db.get(Protokollgruppe, gruppe_id)
    if not row:
        raise HTTPException(404, detail="Protokollgruppe nicht gefunden")
    return single_response(ProtokollgruppeRead.model_validate(row).model_dump())
