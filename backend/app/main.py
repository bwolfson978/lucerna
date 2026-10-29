import asyncio
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator

from app import error_tracking
from app.agent import tracing as agent_tracing
from app.config import settings
from app.mcp import analytics as mcp_analytics
from app.mcp.auth import router as mcp_auth_router
from app.mcp.server import build_route as build_mcp_route
from app.mcp.server import mcp as mcp_server
from app.origins import ORIGIN_REGEX, allowed_origins

# Read the environment once now: a variable that doesn't parse stops startup here.
settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the demo cache in a background thread so it doesn't block startup
    def _warm():
        from app.engine.demo import get_demo

        get_demo()

    threading.Thread(target=_warm, daemon=True).start()

    from app.db.session import close_db, init_db

    await init_db()

    # Generate (or load) the cached /demo conversation in the background.
    from app.agent.demo import get_demo_conversation

    demo_task = asyncio.create_task(get_demo_conversation())

    # The MCP server's session manager must run for the app's lifetime.
    async with mcp_server.session_manager.run():
        yield
    demo_task.cancel()
    await close_db()
    await mcp_analytics.flush()
    error_tracking.shutdown()
    agent_tracing.shutdown()


app = FastAPI(title="Lucerna API", lifespan=lifespan)
error_tracking.register(app)

Instrumentator(excluded_handlers=["/health", "/metrics"]).instrument(app)

_metrics_bearer = HTTPBearer(auto_error=False)


def _verify_metrics_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_metrics_bearer),
) -> None:
    token = settings().metrics_token
    if not token:
        return  # no token configured — allow in local dev
    if credentials is None or not secrets.compare_digest(credentials.credentials, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@app.get("/metrics", include_in_schema=False, dependencies=[Depends(_verify_metrics_token)])
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


allow_origins = allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.api.account import router as account_router
from app.api.agent import router as agent_router
from app.api.demo import router as demo_router
from app.api.email import router as email_router
from app.api.feedback import router as feedback_router
from app.api.mcp_apps import router as mcp_apps_router
from app.api.mcp_apps import sandbox_router as mcp_apps_sandbox_router
from app.api.optimize import router as optimize_router
from app.api.scenario_links import router as scenario_links_router
from app.api.scenarios import router as scenarios_router
from app.api.tax_config import router as tax_config_router

app.include_router(optimize_router, prefix="/api")
app.include_router(demo_router, prefix="/api")
app.include_router(agent_router, prefix="/api")
app.include_router(email_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(scenarios_router, prefix="/api")
app.include_router(account_router, prefix="/api")
app.include_router(tax_config_router, prefix="/api")
app.include_router(mcp_apps_router, prefix="/api")
app.include_router(scenario_links_router, prefix="/api")
app.include_router(mcp_apps_sandbox_router)

# Remote MCP server (streamable HTTP) for Claude, ChatGPT and other MCP clients, and the
# OAuth discovery documents its sign-in uses.
app.include_router(mcp_auth_router)
app.router.routes.append(build_mcp_route())


FAVICON = Path(__file__).parent / "static" / "favicon.ico"


# This service's hosts (mcp.rothconversionsoptimizer.com among them) have no page of their
# own. Send the root to the website so crawlers and favicon lookups find the site's icon.
@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def root():
    return RedirectResponse(
        f"{settings().site_origin}/", status_code=status.HTTP_308_PERMANENT_REDIRECT
    )


# Clients that show the MCP server's domain (connector lists, browser tabs) look here.
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse(FAVICON, media_type="image/x-icon")


# OpenAI's plugin portal verifies we own the MCP domain by fetching this token. Paste the
# token the portal shows into OPENAI_APPS_CHALLENGE (Railway); unset, the path is a 404.
@app.get("/.well-known/openai-apps-challenge", include_in_schema=False)
async def openai_apps_challenge():
    token = settings().openai_apps_challenge
    if not token:
        raise HTTPException(status_code=404)
    return PlainTextResponse(token)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "lucerna-api"}
