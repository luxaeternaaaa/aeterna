import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.telemetry_service import list_recent


router = APIRouter(tags=["realtime"])


@router.websocket("/ws/telemetry")
async def telemetry_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            latest = list_recent(limit=1)[-1].model_dump()
            await websocket.send_json(latest)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return

