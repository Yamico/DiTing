@echo off
cd /d "%~dp0\.."
echo Starting DiTing Tray...
uv run python scripts\start_desktop.py
if errorlevel 1 pause
