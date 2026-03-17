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
    return [LogRecord(**dict(row)) for row in rows]

