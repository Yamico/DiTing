import argparse
import ctypes
import os
import subprocess
import sys


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

from app.utils.desktop_startup import build_child_env, ensure_desktop_dependency


def _show_error(message: str, silent: bool):
    if silent and os.name == "nt":
        ctypes.windll.user32.MessageBoxW(0, message, "DiTing 启动失败", 0x10)
    else:
        print(message, file=sys.stderr)


def _resolve_python_executable(silent: bool) -> str:
    if not silent:
        return sys.executable

    exe_dir = os.path.dirname(sys.executable)
    pythonw = os.path.join(exe_dir, "pythonw.exe")
    return pythonw if os.path.exists(pythonw) else sys.executable


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--silent", action="store_true")
    args = parser.parse_args()

    try:
        ensure_desktop_dependency(PROJECT_ROOT)
    except Exception as exc:
        _show_error(str(exc), silent=args.silent)
        return 1

    env = build_child_env()
    child_cmd = [_resolve_python_executable(args.silent), os.path.join("scripts", "run_tray.py")]

    if args.silent:
        try:
            subprocess.Popen(
                child_cmd,
                cwd=PROJECT_ROOT,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as exc:
            _show_error(f"启动 DiTing 失败：{exc}", silent=True)
            return 1
        return 0

    return subprocess.call(child_cmd, cwd=PROJECT_ROOT, env=env)


if __name__ == "__main__":
    raise SystemExit(main())
