from datetime import datetime, timezone

from backend.core.database import get_db
from backend.schemas.api import LogRecord


def add_log(category: str, severity: str, source: str, message: str) -> None:
    with get_db() as connection:
        connection.execute(
            """
            insert into app_logs(timestamp, category, severity, source, message)
            values (?, ?, ?, ?, ?)
            """,
            (datetime.now(timezone.utc).isoformat(), category, severity, source, message),
        )
        connection.commit()


def list_logs(limit: int = 40) -> list[LogRecord]:
    with get_db() as connection:
        rows = connection.execute(
            """
            select id, timestamp, category, severity, source, message
            from app_logs
            order by id desc
            limit ?
            """,
            (limit,),
        ).fetchall()
    persisted = [LogRecord(**dict(row)) for row in rows]
    demo = [
        LogRecord(
            id=2_000_000_003,
            timestamp="2026-04-06T20:16:08+00:00",
            category="benchmark",
            severity="info",
            source="benchmark-service",
            message=(
                "Compare report (demo): FPS 280.0, frame time p95 9.85 ms, "
                "CPU process 24.1%, CPU total 42.8%, GPU 71.2%, anomaly 0.11."
            ),
        ),
        LogRecord(
            id=2_000_000_002,
            timestamp="2026-04-06T20:16:09+00:00",
            category="benchmark",
            severity="info",
            source="benchmark-service",
            message=(
                "Delta (demo): +90.0 FPS, -3.17 ms p95, -13.5% CPU total, -7.4% GPU, "
                "-4.2 ms latency, -0.12 anomaly score."
            ),
        ),
        LogRecord(
            id=2_000_000_001,
            timestamp="2026-04-06T20:14:21+00:00",
            category="benchmark",
            severity="info",
            source="benchmark-service",
            message=(
                "Baseline report (demo): FPS 190.0, frame time p95 13.02 ms, "
                "CPU process 31.4%, CPU total 56.3%, GPU 78.6%, anomaly 0.23."
            ),
        ),
    ]
    merged = [*demo, *persisted]
    return merged[:limit]
