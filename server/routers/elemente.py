"""Hub-konformer Router fuer Protokollelemente (CRUD)."""

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, func

from core.dependencies import DbSession, CurrentUser
from core.schemas import paginated_response, single_response
from models.element import Protokollelement
from schemas.element import ElementCreate, ElementRead, ElementUpdate

router = APIRouter(prefix="/api/elemente", tags=["elemente"])


@router.get("")
def list_elemente(
    db: DbSession,
    protokoll_id: str | None = Query(None),
    status: int | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
):
    query = select(Protokollelement)
    count_query = select(func.count()).select_from(Protokollelement)

    if protokoll_id:
        query = query.where(Protokollelement.protokoll_id == protokoll_id)
        count_query = count_query.where(Protokollelement.protokoll_id == protokoll_id)
    if status is not None:
        query = query.where(Protokollelement.status == status)
        count_query = count_query.where(Protokollelement.status == status)

    total = db.execute(count_query).scalar()
    rows = db.execute(
        query.order_by(Protokollelement.position)
        .offset((page - 1) * size)
        .limit(size)
    ).scalars().all()
    items = [ElementRead.model_validate(r).model_dump() for r in rows]
    return paginated_response(items=items, total=total, page=page, size=size)


@router.get("/{element_id}")
def get_element(db: DbSession, element_id: str):
    row = db.get(Protokollelement, element_id)
    if not row:
        raise HTTPException(404, detail="Element nicht gefunden")
    return single_response(ElementRead.model_validate(row).model_dump())


@router.post("", status_code=201)
def create_element(db: DbSession, user: CurrentUser, payload: ElementCreate):
    elem = Protokollelement(**payload.model_dump())
    if user.id:
        elem.created_by = user.id
    db.add(elem)
    db.flush()
    db.refresh(elem)
    return single_response(ElementRead.model_validate(elem).model_dump())


@router.put("/{element_id}")
def update_element(db: DbSession, element_id: str, payload: ElementUpdate):
    elem = db.get(Protokollelement, element_id)
    if not elem:
        raise HTTPException(404, detail="Element nicht gefunden")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(elem, key, value)
    db.flush()
    db.refresh(elem)
    return single_response(ElementRead.model_validate(elem).model_dump())


@router.delete("/{element_id}")
def delete_element(db: DbSession, element_id: str):
    elem = db.get(Protokollelement, element_id)
    if not elem:
        raise HTTPException(404, detail="Element nicht gefunden")
    db.delete(elem)
    return single_response({"deleted": element_id})
