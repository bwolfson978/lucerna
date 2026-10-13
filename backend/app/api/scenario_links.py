"""Open a full results link from outside the web app (an MCP App View in ChatGPT or
Claude, or a link the model shared). See app/tools/links.py."""

from __future__ import annotations

import anyio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.tools import core
from app.tools.draft import current_year
from app.tools.links import MAX_PARAM_LENGTH, decode_scenario
from app.tools.models import ScenarioUpdate

router = APIRouter()


class OpenLinkRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=MAX_PARAM_LENGTH)
    label: str | None = Field(default=None, max_length=60)


class OpenLinkResponse(BaseModel):
    result_id: str
    label: str
    # The scenario as the web app's draft (fills the form and the conversation).
    draft: dict
    # The full engine result for the results page.
    result: dict


@router.post("/scenario-links/open", response_model=OpenLinkResponse)
async def open_scenario_link(body: OpenLinkRequest):
    error: str | None = None
    try:
        update = ScenarioUpdate.model_validate(decode_scenario(body.scenario))
        draft = core.draft_from_scenario(update, current_year())
        scenario_input, result = await anyio.to_thread.run_sync(core.run_draft, draft)
    except ValidationError:
        error = "This link's scenario isn't valid."
    except (core.ToolError, ValueError) as err:
        error = str(err)
    if error is not None:
        raise HTTPException(status_code=400, detail=error)
    return OpenLinkResponse(
        result_id=core.result_id_for(scenario_input),
        label=body.label or "Your scenario",
        draft=draft.model_dump(mode="json"),
        result=result.model_dump(mode="json"),
    )
