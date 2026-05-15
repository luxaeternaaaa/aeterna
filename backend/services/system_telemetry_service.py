import atexit
import csv
import ctypes
import subprocess
import threading
from datetime import UTC, datetime
from typing import ClassVar

from backend.schemas.api import SystemTelemetryPayload


class FileTime(ctypes.Structure):
    _fields_: ClassVar = [("dwLowDateTime", ctypes.c_uint32), ("dwHighDateTime", ctypes.c_uint32)]


class MemoryStatusEx(ctypes.Structure):
    _fields_: ClassVar = [
        ("dwLength", ctypes.c_uint32),
        ("dwMemoryLoad", ctypes.c_uint32),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


_cpu_lock = threading.Lock()
_last_cpu_times: tuple[int, int, int] | None = None
_last_cpu_pct = 0.0

_gpu_lock = threading.Lock()
_gpu_process: subprocess.Popen[str] | None = None
_gpu_pct: float | None = None


def _filetime_to_int(value: FileTime) -> int:
    return (int(value.dwHighDateTime) << 32) | int(value.dwLowDateTime)


def _read_cpu_pct() -> float:
    global _last_cpu_pct, _last_cpu_times

    idle = FileTime()
    kernel = FileTime()
    user = FileTime()
    if not ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)):
        return _last_cpu_pct

    current = (_filetime_to_int(idle), _filetime_to_int(kernel), _filetime_to_int(user))
    with _cpu_lock:
        if _last_cpu_times is None:
            _last_cpu_times = current
            return _last_cpu_pct
        idle_delta = current[0] - _last_cpu_times[0]
        kernel_delta = current[1] - _last_cpu_times[1]
        user_delta = current[2] - _last_cpu_times[2]
        total = kernel_delta + user_delta
        _last_cpu_times = current
        if total > 0:
            _last_cpu_pct = round(max(0.0, min(100.0, ((total - idle_delta) / total) * 100.0)), 1)
        return _last_cpu_pct


def _read_memory() -> tuple[float, float, float]:
    status = MemoryStatusEx()
    status.dwLength = ctypes.sizeof(MemoryStatusEx)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return 0.0, 0.0, 0.0

    total_gb = status.ullTotalPhys / 1024 / 1024 / 1024
    used_gb = (status.ullTotalPhys - status.ullAvailPhys) / 1024 / 1024 / 1024
    return round(used_gb, 1), round(total_gb, 1), round(float(status.dwMemoryLoad), 1)


def _parse_gpu_csv_line(line: str) -> float | None:
    try:
        row = next(csv.reader([line]))
    except csv.Error:
        return None
    if len(row) < 2 or "PDH-CSV" in row[0]:
        return None

    values: list[float] = []
    for item in row[1:]:
        try:
            values.append(float(item))
        except ValueError:
            continue
    if not values:
        return None
    return round(max(0.0, min(100.0, sum(values))), 1)


def _gpu_reader(process: subprocess.Popen[str]) -> None:
    global _gpu_pct

    if process.stdout is None:
        return
    for line in process.stdout:
        value = _parse_gpu_csv_line(line.strip())
        if value is None:
            continue
        with _gpu_lock:
            _gpu_pct = value


def _ensure_gpu_sampler() -> None:
    global _gpu_process

    with _gpu_lock:
        if _gpu_process is not None and _gpu_process.poll() is None:
            return
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            _gpu_process = subprocess.Popen(
                ["typeperf", r"\GPU Engine(*)\Utilization Percentage", "-si", "1"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="ignore",
                creationflags=creation_flags,
            )
        except OSError:
            _gpu_process = None
            return
        thread = threading.Thread(target=_gpu_reader, args=(_gpu_process,), daemon=True)
        thread.start()


def _shutdown_gpu_sampler() -> None:
    with _gpu_lock:
        if _gpu_process is not None and _gpu_process.poll() is None:
            _gpu_process.terminate()


atexit.register(_shutdown_gpu_sampler)


def get_system_telemetry() -> SystemTelemetryPayload:
    _ensure_gpu_sampler()
    ram_used_gb, ram_total_gb, memory_pressure_pct = _read_memory()
    with _gpu_lock:
        gpu_pct = _gpu_pct

    return SystemTelemetryPayload(
        timestamp=datetime.now(UTC).isoformat(),
        cpu_total_pct=_read_cpu_pct(),
        gpu_usage_pct=gpu_pct,
        ram_used_gb=ram_used_gb,
        ram_total_gb=ram_total_gb,
        memory_pressure_pct=memory_pressure_pct,
        source="windows-performance-counters",
    )
