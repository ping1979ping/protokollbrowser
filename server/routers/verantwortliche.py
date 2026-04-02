"""Hub-konformer Router fuer Verantwortliche (read-only)."""

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from core.dependencies import DbSession
from core.schemas import paginated_response
from models.verantwortlicher import Verantwortlicher
from schemas.verantwortlicher import VerantwortlicherRead

router = APIRouter(prefix="/api/verantwortliche", tags=["verantwortliche"])


@router.get("")
def list_verantwortliche(
    db: DbSession,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
):
    total = db.execute(select(func.count()).select_from(Verantwortlicher)).scalar()
    rows = db.execute(
        select(Verantwortlicher)
        .order_by(Verantwortlicher.name)
        .offset((page - 1) * size)
        .limit(size)
    ).scalars().all()
    items = [VerantwortlicherRead.model_validate(r).model_dump() for r in rows]
    return paginated_response(items=items, total=total, page=page, size=size)
