import os
import re
import sys
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- App-wide constants (read once at import time) ---
def _read_version() -> str:
    """Read version. Checks bundled version.txt (PyInstaller), VERSION (Docker), then pyproject.toml (dev)."""
    # PyInstaller bundle: version.txt is bundled into _MEIPASS/src-tauri/
    meipass = getattr(sys, '_MEIPASS', None)
    if meipass:
        bundled = os.path.join(meipass, "src-tauri", "version.txt")
        try:
            with open(bundled, "r", encoding="utf-8") as f:
                content = f.read()
                match = re.search(r"__version__\s*=\s*'([^']+)'", content)
                if match:
                    return match.group(1)
        except OSError:
            pass

    base_dir = os.path.join(os.path.dirname(__file__), "..", "..")
    # Docker: a plain VERSION file is generated during build
    version_file = os.path.join(base_dir, "VERSION")
    try:
        with open(version_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        pass
    # Local dev: parse pyproject.toml
    toml_path = os.path.join(base_dir, "pyproject.toml")
    try:
        with open(toml_path, "r", encoding="utf-8") as f:
            match = re.search(r'^version\s*=\s*"([^"]+)"', f.read(), re.MULTILINE)
            return match.group(1) if match else "0.0.0"
    except OSError:
        return "0.0.0"

APP_VERSION = _read_version()

GITHUB_REPO = "Yamico/DiTing"


class Settings(BaseSettings):
    PROJECT_NAME: str = "DiTing"
    API_V1_STR: str = "/api"
    
    # Data Directories
    DATA_DIR: str = "data"
    DB_PATH: str = "data/db/diting_prod.db"
    TEMP_DOWNLOADS_DIR: str = "data/temp_downloads"
    TEMP_UPLOADS_DIR: str = "data/temp_uploads"
    COVERS_DIR: str = "data/covers"
    MEDIA_CACHE_DIR: str = "data/media_cache"
    NOTE_SCREENSHOTS_DIR: str = "data/note_screenshots"
    QA_ATTACHMENTS_DIR: str = "data/qa_attachments"
    
    # ASR Configuration
    ASR_ENGINE: str = "sensevoice"

    # ASR Workers — accepts both old {engine: url} and new {url: {}} or {worker_id: {url}} formats.
    # Old format is auto-migrated on first load.
    # In .env, you can also use a comma-separated list: ASR_WORKERS=http://localhost:8001,http://gpu:8001
    ASR_WORKERS: dict = {}

    WIZARD_COMPLETED: bool = False  # Persisted wizard completion flag

    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore"
    )

settings = Settings()

# Ensure directories exist
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(os.path.dirname(settings.DB_PATH), exist_ok=True)
os.makedirs(settings.TEMP_DOWNLOADS_DIR, exist_ok=True)
os.makedirs(settings.TEMP_UPLOADS_DIR, exist_ok=True)
os.makedirs(settings.COVERS_DIR, exist_ok=True)
os.makedirs(settings.MEDIA_CACHE_DIR, exist_ok=True)
os.makedirs(settings.NOTE_SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(settings.QA_ATTACHMENTS_DIR, exist_ok=True)
