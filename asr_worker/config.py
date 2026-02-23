"""
ASR Worker Configuration Loader

Priority: Environment Variables > worker_config.yaml > Code Defaults
"""

import os
import logging

logger = logging.getLogger("ASR Worker")

# ── Code Defaults ──
_DEFAULTS = {
    "engine": "sensevoice",
    "port": 8001,
    "device": "cuda:0",
    "shared_paths": [],
    "temp_upload_dir": "temp_uploads",
    "model_base_path": None,
    "models": {
        "sensevoice": {
            "model_id": "iic/SenseVoiceSmall",
            "vad_model": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
            "vad_max_segment_time": 30000,
            "cache_dir": None,
        },
        "whisper": {
            "model_name": "large-v3-turbo",
            "download_root": None,
        },
        "qwen3asr": {
            "model_name": "Qwen/Qwen3-ASR-1.7B",
            "aligner_name": "Qwen/Qwen3-ForcedAligner-0.6B",
            "use_aligner": True,
            "batch_size": 8,
            "max_tokens": 256,
        },
    },
}

# ── Env → Config key mapping ──
_ENV_MAP = {
    "ASR_ENGINE":       "engine",
    "PORT":             "port",
    "ASR_DEVICE":       "device",
    "MAX_CONCURRENCY":  "max_concurrency",
    "SHARED_PATHS":     "shared_paths",
    "TEMP_UPLOAD_DIR":  "temp_upload_dir",
    "MODEL_BASE_PATH":  "model_base_path",
}


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base (override wins)."""
    result = base.copy()
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def _load_yaml(path: str) -> dict:
    """Load YAML config file. Returns {} if not found or parse error."""
    if not os.path.exists(path):
        return {}
    try:
        import yaml
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data if isinstance(data, dict) else {}
    except ImportError:
        logger.warning("⚠️ PyYAML not installed, skipping worker_config.yaml")
        return {}
    except Exception as e:
        logger.warning(f"⚠️ Failed to parse {path}: {e}")
        return {}


def _apply_env_overrides(cfg: dict) -> dict:
    """Apply environment variable overrides to top-level keys."""
    for env_key, cfg_key in _ENV_MAP.items():
        val = os.getenv(env_key)
        if val is None:
            continue

        if cfg_key in ("port", "max_concurrency"):
            cfg[cfg_key] = int(val)
        elif cfg_key == "shared_paths":
            cfg[cfg_key] = [p.strip() for p in val.split(",") if p.strip()]
        else:
            cfg[cfg_key] = val

    # Model-specific env overrides
    model_env = {
        # SenseVoice
        "MODELSCOPE_CACHE": ("sensevoice", "cache_dir"),
        # Whisper
        "WHISPER_MODEL_PATH": ("whisper", "download_root"),
        # Qwen3-ASR
        "QWEN3_ASR_MODEL": ("qwen3asr", "model_name"),
        "QWEN3_ASR_ALIGNER": ("qwen3asr", "aligner_name"),
        "QWEN3_ASR_USE_ALIGNER": ("qwen3asr", "use_aligner"),
        "QWEN3_ASR_BATCH_SIZE": ("qwen3asr", "batch_size"),
        "QWEN3_ASR_MAX_TOKENS": ("qwen3asr", "max_tokens"),
    }

    models = cfg.setdefault("models", {})
    for env_key, (engine, field) in model_env.items():
        val = os.getenv(env_key)
        if val is None:
            continue
        engine_cfg = models.setdefault(engine, {})
        # Type coercion
        if field in ("batch_size", "max_tokens", "vad_max_segment_time"):
            engine_cfg[field] = int(val)
        elif field == "use_aligner":
            engine_cfg[field] = val.lower() == "true"
        else:
            engine_cfg[field] = val

    return cfg


def load_config(yaml_path: str = None) -> dict:
    """
    Load worker configuration with priority:
    Environment Variables > worker_config.yaml > Code Defaults
    """
    # 1. Start with defaults
    cfg = _DEFAULTS.copy()
    cfg["models"] = {k: v.copy() for k, v in _DEFAULTS["models"].items()}

    # 2. Merge YAML (if available)
    if yaml_path is None:
        # Look next to this file
        yaml_path = os.path.join(os.path.dirname(__file__), "worker_config.yaml")
    yaml_cfg = _load_yaml(yaml_path)
    if yaml_cfg:
        cfg = _deep_merge(cfg, yaml_cfg)
        logger.info(f"📄 Loaded config from {yaml_path}")

    # 3. Apply environment variable overrides (highest priority)
    cfg = _apply_env_overrides(cfg)

    # 4. Resolve model_base_path → propagate to all engines uniformly
    #    model_base_path is the SINGLE knob for "where do all models live"
    base = cfg.get("model_base_path")
    if base:
        # Set environment variables for libraries that read them directly
        os.environ.setdefault("MODELSCOPE_CACHE", base)    # FunASR / ModelScope
        os.environ.setdefault("WHISPER_MODEL_PATH", base)  # openai-whisper
        os.environ.setdefault("HF_HOME", base)             # HuggingFace (Qwen3-ASR)

        # Propagate to per-engine config if not explicitly overridden
        models = cfg.get("models", {})
        for engine_key, field_name in [("sensevoice", "cache_dir"), ("whisper", "download_root")]:
            engine_cfg = models.get(engine_key, {})
            if not engine_cfg.get(field_name):
                engine_cfg[field_name] = base

    return cfg


# ── Singleton ──
_config = None


def get_config() -> dict:
    """Get the global worker configuration (loaded once)."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def get_engine_config(engine_name: str) -> dict:
    """Get model-specific configuration for a given engine."""
    cfg = get_config()
    return cfg.get("models", {}).get(engine_name, {})
