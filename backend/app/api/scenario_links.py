"""Open a full results link from outside the web app (an MCP App View in ChatGPT or
Claude, or a link the model shared). See app/tools/links.py."""

from __future__ import annotations

import anyio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

from app.engine.types import FilingStatus
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year
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


def _with_assumed_birth_months(draft: ScenarioDraft) -> ScenarioDraft:
    """Links shared before birth dates were asked for carry only an age, which gives the
    birth year. They still open: the result assumes January, which puts 59½ midway
    through the year they turn 59, and a joint spouse the same age (as those links
    were run). The draft sent back leaves the months empty, so the next run asks."""
    if draft.birth_year is None:
        return draft
    joint = draft.filing_status == FilingStatus.MFJ
    return draft.model_copy(
        update={
            "birth_month": draft.birth_month or 1,
            "spouse_birth_year": draft.spouse_birth_year or (draft.birth_year if joint else None),
            "spouse_birth_month": draft.spouse_birth_month or (1 if joint else None),
        }
    )


@router.post("/scenario-links/open", response_model=OpenLinkResponse)
async def open_scenario_link(body: OpenLinkRequest):
    error: str | None = None
    try:
        update = ScenarioUpdate.model_validate(
            core.upgrade_scenario(decode_scenario(body.scenario), current_year())
        )
        draft = core.draft_from_scenario(update, current_year())
        scenario_input, result = await anyio.to_thread.run_sync(
            core.run_draft, _with_assumed_birth_months(draft)
        )
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
