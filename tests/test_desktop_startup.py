from types import SimpleNamespace

from app.utils.desktop_startup import build_child_env, ensure_desktop_dependency


def test_build_child_env_forces_utf8():
    env = build_child_env({"PATH": "X"})

    assert env["PATH"] == "X"
    assert env["PYTHONUTF8"] == "1"
    assert env["PYTHONIOENCODING"] == "utf-8"


def test_ensure_desktop_dependency_installs_pystray_when_missing():
    calls = []

    def fake_importer(name: str):
        if name == "pystray":
            raise ModuleNotFoundError(name)
        return object()

    def fake_runner(cmd, cwd=None, check=False):
        calls.append({"cmd": cmd, "cwd": cwd, "check": check})
        return SimpleNamespace(returncode=0)

    installed = ensure_desktop_dependency(
        project_root="D:/demo",
        importer=fake_importer,
        runner=fake_runner,
        uv_executable="uv",
    )

    assert installed is True
    assert calls == [
        {
            "cmd": ["uv", "sync", "--extra", "desktop"],
            "cwd": "D:/demo",
            "check": False,
        }
    ]


def test_ensure_desktop_dependency_skips_install_when_pystray_exists():
    calls = []

    def fake_runner(cmd, cwd=None, check=False):
        calls.append({"cmd": cmd, "cwd": cwd, "check": check})
        return SimpleNamespace(returncode=0)

    installed = ensure_desktop_dependency(
        project_root="D:/demo",
        importer=lambda name: object(),
        runner=fake_runner,
        uv_executable="uv",
    )

    assert installed is False
    assert calls == []
