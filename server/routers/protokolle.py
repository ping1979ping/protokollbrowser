"""Hub-konformer Router fuer Protokolle."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, func

from core.dependencies import DbSession
from core.schemas import paginated_response, single_response
from models.protokoll import Protokoll
from schemas.protokoll import ProtokollRead

router = APIRouter(prefix="/api/protokolle", tags=["protokolle"])


@router.get("")
def list_protokolle(
    db: DbSession,
    gruppe_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    query = select(Protokoll)
    count_query = select(func.count()).select_from(Protokoll)

    if gruppe_id:
        query = query.where(Protokoll.gruppe_id == gruppe_id)
        count_query = count_query.where(Protokoll.gruppe_id == gruppe_id)

    total = db.execute(count_query).scalar()
    rows = db.execute(
        query.order_by(Protokoll.nummer.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).scalars().all()
    items = [ProtokollRead.model_validate(r).model_dump() for r in rows]
    return paginated_response(items=items, total=total, page=page, size=size)


@router.get("/{protokoll_id}")
def get_protokoll(db: DbSession, protokoll_id: str):
    row = db.get(Protokoll, protokoll_id)
    if not row:
        raise HTTPException(404, detail="Protokoll nicht gefunden")
    return single_response(ProtokollRead.model_validate(row).model_dump())
