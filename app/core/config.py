import os
import re
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- App-wide constants (read once at import time) ---
def _read_version() -> str:
    """Read version. Checks VERSION file first (Docker), then pyproject.toml (local dev)."""
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
    
    # ASR Configuration
    ASR_ENGINE: str = "sensevoice"
    
    # ASR Workers (Engine Name -> URL)
    ASR_WORKERS: dict = {
        "sensevoice": "http://localhost:8001",
        "whisper": "http://localhost:8002",
        "qwen3asr": "http://localhost:8003"
    }

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
