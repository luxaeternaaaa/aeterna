import shutil
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT_DIR / "app" / "src-tauri" / "binaries"
ENTRYPOINT = ROOT_DIR / "core" / "runtime.py"
CONFIG_DIR = ROOT_DIR / "config"


def host_tuple() -> str:
    return subprocess.check_output(["rustc", "--print", "host-tuple"], text=True, cwd=ROOT_DIR).strip()


def build_sidecar() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    generic_target = DIST_DIR / "aeterna-core.exe"
    triple_target = DIST_DIR / f"aeterna-core-{host_tuple()}.exe"
    for target in (generic_target, triple_target):
        if target.exists():
            target.unlink()
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--noconsole",
        "--name",
        "aeterna-core",
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(ROOT_DIR / "build" / "pyinstaller"),
        "--specpath",
        str(ROOT_DIR / "build"),
        "--add-data",
        f"{CONFIG_DIR};config",
        str(ENTRYPOINT),
    ]
    subprocess.run(command, check=True, cwd=ROOT_DIR)
    shutil.copy2(generic_target, triple_target)


if __name__ == "__main__":
    build_sidecar()
