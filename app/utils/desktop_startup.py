import importlib
import os
import shutil
import subprocess
from typing import Callable, Mapping, Optional


def build_child_env(base_env: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def ensure_desktop_dependency(
    project_root: str,
    importer: Callable[[str], object] = importlib.import_module,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
    uv_executable: Optional[str] = None,
) -> bool:
    try:
        importer("pystray")
        return False
    except ModuleNotFoundError:
        uv_cmd = uv_executable or shutil.which("uv")
        if not uv_cmd:
            raise RuntimeError("未找到 uv，请先安装 uv。")

        result = runner(
            [uv_cmd, "sync", "--extra", "desktop"],
            cwd=project_root,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("安装桌面启动依赖失败，请手动运行：uv sync --extra desktop")
        return True
