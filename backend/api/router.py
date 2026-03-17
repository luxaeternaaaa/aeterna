from fastapi import APIRouter

from backend.api.routers.bootstrap import router as bootstrap_router
from backend.api.routers.dashboard import router as dashboard_router
from backend.api.routers.health import router as health_router
from backend.api.routers.logs import router as logs_router
from backend.api.routers.models import router as models_router
from backend.api.routers.realtime import router as realtime_router
from backend.api.routers.settings import router as settings_router
from backend.api.routers.snapshots import router as snapshots_router
from backend.api.routers.summary import router as summary_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(bootstrap_router)
api_router.include_router(dashboard_router)
api_router.include_router(settings_router)
api_router.include_router(models_router)
api_router.include_router(logs_router)
api_router.include_router(snapshots_router)
api_router.include_router(summary_router)
api_router.include_router(realtime_router)
