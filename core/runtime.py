import os
import sys
import threading
import time
from pathlib import Path

import uvicorn

from backend.main import app


if os.name == "nt":
    from ctypes import wintypes, windll


ROOT_DIR = Path(__file__).resolve().parents[1]


def configure_environment() -> None:
    if str(ROOT_DIR) not in sys.path:
        sys.path.insert(0, str(ROOT_DIR))
    os.environ.setdefault("AETERNA_HOST", "127.0.0.1")
    os.environ.setdefault("AETERNA_PORT", "8000")
    if getattr(sys, "frozen", False):
        os.environ.setdefault("AETERNA_RUNTIME_ROOT", str(Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "Aeterna"))


def watch_parent_process() -> None:
    parent_pid = os.getenv("AETERNA_PARENT_PID")
    if not parent_pid or os.name != "nt":
        return

    def worker() -> None:
        handle = windll.kernel32.OpenProcess(wintypes.DWORD(0x00100000), False, int(parent_pid))
        if not handle:
            os._exit(0)
        while True:
            if windll.kernel32.WaitForSingleObject(handle, 0) == 0:
                windll.kernel32.CloseHandle(handle)
                os._exit(0)
            time.sleep(2)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()


def main() -> None:
    configure_environment()
    watch_parent_process()
    uvicorn.run(
        app,
        host=os.environ["AETERNA_HOST"],
        port=int(os.environ["AETERNA_PORT"]),
        reload=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()
