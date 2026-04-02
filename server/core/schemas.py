"""Hub-kompatible Standard-Schemas fuer API-Responses.

Alle API-Responses nutzen dasselbe Envelope-Format:
    { "data": ..., "meta": { ... }, "errors": [...] }
"""

from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationMeta(BaseModel):
    page: int = 1
    size: int = 20
    total: int = 0
    pages: int = 0


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    meta: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []


class ApiListResponse(BaseModel, Generic[T]):
    data: list[T] = []
    meta: PaginationMeta = PaginationMeta()
    errors: list[dict[str, Any]] = []


class ApiError(BaseModel):
    code: str
    message: str
    field: str | None = None


def paginated_response(items: list, total: int, page: int, size: int) -> dict:
    pages = (total + size - 1) // size if size > 0 else 0
    return {
        "data": items,
        "meta": {"page": page, "size": size, "total": total, "pages": pages},
        "errors": [],
    }


def single_response(item: Any, **meta) -> dict:
    return {"data": item, "meta": meta, "errors": []}


def error_response(code: str, message: str, field: str = None) -> dict:
    return {"data": None, "meta": {}, "errors": [{"code": code, "message": message, "field": field}]}
