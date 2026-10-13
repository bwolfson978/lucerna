"""The signed-in user's saved scenarios, for the web app's "My scenarios" page and its
Save button. Same logic as the MCP tools (``app.tools.saved``).

GET    /api/saved-scenarios          list, newest first
POST   /api/saved-scenarios          save {draft, name?}
GET    /api/saved-scenarios/{id}     one, with its draft projected from this year
PATCH  /api/saved-scenarios/{id}     rename and/or replace the draft
DELETE /api/saved-scenarios/{id}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.auth.identity import require_user
from app.tools import saved
from app.tools.draft import ScenarioDraft, current_year

router = APIRouter()

_STATUS = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "full": status.HTTP_409_CONFLICT,
    "empty": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    "sign_in_required": status.HTTP_401_UNAUTHORIZED,
}


def _http_error(err: saved.SavedError) -> HTTPException:
    return HTTPException(
        status_code=_STATUS.get(err.code, 400), detail={"code": err.code, "message": str(err)}
    )


class SaveRequest(BaseModel):
    draft: ScenarioDraft
    name: str | None = Field(default=None, max_length=saved.NAME_MAX)


class UpdateRequest(BaseModel):
    draft: ScenarioDraft | None = None
    name: str | None = Field(default=None, max_length=saved.NAME_MAX)


@router.get("/saved-scenarios")
async def list_saved(user_id: str = Depends(require_user)) -> dict[str, Any]:
    try:
        return {"saved_scenarios": await saved.list_saved(user_id)}
    except saved.SavedError as err:
        raise _http_error(err) from err


@router.post("/saved-scenarios", status_code=status.HTTP_201_CREATED)
async def save(body: SaveRequest, user_id: str = Depends(require_user)) -> dict[str, Any]:
    try:
        return await saved.save(user_id, body.draft, body.name)
    except saved.SavedError as err:
        raise _http_error(err) from err


@router.get("/saved-scenarios/{scenario_id}")
async def open_saved(scenario_id: str, user_id: str = Depends(require_user)) -> dict[str, Any]:
    try:
        row, draft = await saved.get_saved(user_id, scenario_id)
    except saved.SavedError as err:
        raise _http_error(err) from err
    return {
        **saved.summary(row),
        "draft": saved.refreshed_draft(draft, current_year()).model_dump(mode="json"),
    }


@router.patch("/saved-scenarios/{scenario_id}")
async def update_saved(
    scenario_id: str, body: UpdateRequest, user_id: str = Depends(require_user)
) -> dict[str, Any]:
    try:
        return await saved.update_saved(user_id, scenario_id, name=body.name, draft=body.draft)
    except saved.SavedError as err:
        raise _http_error(err) from err


@router.delete("/saved-scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved(scenario_id: str, user_id: str = Depends(require_user)) -> Response:
    try:
        await saved.delete_saved(user_id, scenario_id)
    except saved.SavedError as err:
        raise _http_error(err) from err
    return Response(status_code=status.HTTP_204_NO_CONTENT)
