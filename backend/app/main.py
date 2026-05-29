import os
import secrets
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the demo cache in a background thread so it doesn't block startup
    def _warm():
        from app.engine.demo import get_demo

        get_demo()

    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(title="Lucerna API", lifespan=lifespan)

Instrumentator(excluded_handlers=["/health", "/metrics"]).instrument(app)

_metrics_bearer = HTTPBearer(auto_error=False)


def _verify_metrics_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_metrics_bearer),
) -> None:
    token = os.environ.get("METRICS_TOKEN", "")
    if not token:
        return  # no token configured — allow in local dev
    if credentials is None or not secrets.compare_digest(credentials.credentials, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@app.get("/metrics", include_in_schema=False, dependencies=[Depends(_verify_metrics_token)])
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


_default_origins = ["http://localhost:3000"]
_env_origins = os.environ.get("ALLOWED_ORIGINS", "")
allow_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()] if _env_origins else _default_origins
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"https://(lucerna-.*\.vercel\.app|(www\.)?rothconversionsoptimizer\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.api.chat import router as chat_router
from app.api.demo import router as demo_router
from app.api.email import router as email_router
from app.api.feedback import router as feedback_router
from app.api.optimize import router as optimize_router
from app.api.tax_config import router as tax_config_router

app.include_router(optimize_router, prefix="/api")
app.include_router(demo_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(email_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(tax_config_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "lucerna-api"}
