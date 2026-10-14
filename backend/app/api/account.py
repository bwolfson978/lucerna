"""DELETE /api/account: erase what we store for the signed-in user.

The web app calls this before deleting the Clerk user itself, so saved scenarios
never outlive the account they belong to. Once the response is sent, the user's
PostHog person (analytics, session replays, signed-in feedback) is deleted too, when
the PostHog API is configured (see app/privacy/erasure.py).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import get_current_user
from app.db import scenarios as store
from app.privacy import erasure

router = APIRouter()


class AccountDeleted(BaseModel):
    deleted_scenarios: int


@router.delete("/account", response_model=AccountDeleted)
async def delete_account_data(
    background: BackgroundTasks, user_id: str = Depends(get_current_user)
) -> AccountDeleted:
    try:
        deleted = await store.delete_all(user_id)
    except store.StorageUnavailable as err:
        # Fail rather than report success: the client would then delete the Clerk user
        # and leave its scenarios behind.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not available"
        ) from err
    background.add_task(erasure.forget_web_person, user_id)
    return AccountDeleted(deleted_scenarios=deleted)
