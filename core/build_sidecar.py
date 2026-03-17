import shutil
import subprocess
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = ROOT_DIR / "core" / "sidecar"
DIST_DIR = ROOT_DIR / "app" / "src-tauri" / "binaries"


def host_tuple() -> str:
    return subprocess.check_output(["rustc", "--print", "host-tuple"], text=True, cwd=ROOT_DIR).strip()


def build_sidecar(release: bool = True) -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    profile = "release" if release else "debug"
    generic_target = DIST_DIR / "aeterna-sidecar.exe"
    triple_target = DIST_DIR / f"aeterna-sidecar-{host_tuple()}.exe"
    for target in (generic_target, triple_target):
        if target.exists():
            target.unlink()
    command = ["cargo", "build", "--manifest-path", str(PROJECT_DIR / "Cargo.toml")]
    if release:
        command.append("--release")
    subprocess.run(command, check=True, cwd=ROOT_DIR)
    built = PROJECT_DIR / "target" / profile / "aeterna-sidecar.exe"
    shutil.copy2(built, generic_target)
    shutil.copy2(built, triple_target)


if __name__ == "__main__":
    build_sidecar()
