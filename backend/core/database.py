import sqlite3
from contextlib import contextmanager
from typing import Iterator

from backend.core.paths import DB_PATH, ensure_directories


def init_database() -> None:
    ensure_directories()
    with sqlite3.connect(DB_PATH) as connection:
        connection.executescript(
            """
            create table if not exists telemetry (
              id integer primary key autoincrement,
              timestamp text not null,
              game text not null,
              ping real not null,
              jitter real not null,
              packet_loss real not null,
              cpu_usage real not null,
              gpu_usage real not null,
              ram_usage real not null,
              anomaly_score real not null,
              threat_level text not null
            );
            create table if not exists app_logs (
              id integer primary key autoincrement,
              timestamp text not null,
              category text not null,
              severity text not null,
              source text not null,
              message text not null
            );
            """
        )


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    ensure_directories()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()

