"""DELETE /api/account: erase what we store for the signed-in user.

The web app calls this before deleting the Clerk user itself, so saved scenarios
never outlive the account they belong to.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import get_current_user
from app.db import scenarios as store

router = APIRouter()


class AccountDeleted(BaseModel):
    deleted_scenarios: int


@router.delete("/account", response_model=AccountDeleted)
async def delete_account_data(user_id: str = Depends(get_current_user)) -> AccountDeleted:
    try:
        deleted = await store.delete_all(user_id)
    except store.StorageUnavailable as err:
        # Fail rather than report success: the client would then delete the Clerk user
        # and leave its scenarios behind.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not available"
        ) from err
    return AccountDeleted(deleted_scenarios=deleted)
