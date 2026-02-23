
import os
import httpx
import asyncio
from urllib.parse import urlparse
from starlette.concurrency import run_in_threadpool
import time
from typing import List, Dict, Optional
from app.core.config import settings
from app.core.logger import logger
from app.db.asr_config import get_active_model_for_engine
from app.db.system_config import get_system_config, set_system_config
import json

class ASRClient:
    def __init__(self):
        self.workers = settings.ASR_WORKERS
        self.availability = {}  # {"sensevoice": True, "whisper": False}
        self.latency = {}       # {"sensevoice": 0.0, "whisper": -1}
        self._check_task = None
        self.shared_paths = {}  # {"sensevoice": ["/data", ...], ...}
        self._last_health = {}  # Cache full /health response per engine
        
        # Runtime Config - Load from DB or use defaults
        default_priority = list(self.workers.keys())
        if "bailian" not in default_priority:
            default_priority.append("bailian")
            
        self.config = {
             # Default priority is order in settings or just list of keys
             "priority": default_priority, 
             "strict_mode": False,
             "active_engine": None # Explicitly selected active engine
        }
        
        # Load persisted config from DB
        self._load_config_from_db()
        
        # Set default active engine if not loaded
        if not self.config.get("active_engine") and self.config["priority"]:
            self.config["active_engine"] = self.config["priority"][0]
        
        self._init_state()

    def _init_state(self):
        for engine in self.workers.keys():
            self.availability[engine] = False
            self.latency[engine] = -1.0
        # Cloud engines assumed available
        self.availability["bailian"] = True
        self.latency["bailian"] = 0.0

    def _load_config_from_db(self):
        """Load ASR config from system_configs table."""
        try:
            # Priority
            saved_priority = get_system_config("asr_priority")
            if saved_priority:
                self.config["priority"] = json.loads(saved_priority)
                logger.info(f"📂 Loaded ASR priority from DB: {self.config['priority']}")
            
            # Strict Mode
            saved_strict = get_system_config("asr_strict_mode")
            if saved_strict is not None:
                self.config["strict_mode"] = saved_strict.lower() == "true"
                logger.info(f"📂 Loaded ASR strict_mode from DB: {self.config['strict_mode']}")
            
            # Active Engine
            saved_engine = get_system_config("asr_active_engine")
            if saved_engine:
                self.config["active_engine"] = saved_engine
                logger.info(f"📂 Loaded ASR active_engine from DB: {self.config['active_engine']}")
            
            # Disabled Engines
            saved_disabled = get_system_config("asr_disabled_engines")
            if saved_disabled:
                try:
                    self.config["disabled_engines"] = json.loads(saved_disabled)
                    logger.info(f"📂 Loaded ASR disabled_engines from DB: {self.config.get('disabled_engines')}")
                except Exception as e:
                    logger.error(f"❌ Failed to parse disabled_engines: {e}")
                    self.config["disabled_engines"] = []
            else:
                self.config["disabled_engines"] = []

        except Exception as e:
            logger.warning(f"⚠️ Failed to load ASR config from DB: {e}")

    def _save_config_to_db(self):
        """Save ASR config to system_configs table."""
        try:
            set_system_config("asr_priority", json.dumps(self.config["priority"]))
            set_system_config("asr_strict_mode", str(self.config["strict_mode"]).lower())
            set_system_config("asr_disabled_engines", json.dumps(self.config.get("disabled_engines", [])))
            if self.config["active_engine"]:
                set_system_config("asr_active_engine", self.config["active_engine"])
            logger.info(f"💾 Saved ASR config to DB")
        except Exception as e:
            logger.warning(f"⚠️ Failed to save ASR config to DB: {e}")

    async def check_health(self):
        """Perform a single health check pass for all workers"""
        # Concurrent check
        tasks = []
        engines = list(self.workers.keys())
        
        async def check_one(engine, url):
            start = time.time()
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.get(f"{url}/health")
                    duration = (time.time() - start) * 1000
                    is_ok = resp.status_code == 200
                    
                    if is_ok != self.availability.get(engine, False):
                         if is_ok:
                             logger.info(f"🟢 ASR Worker [{engine}] is ONLINE ({duration:.0f}ms)")
                         else:
                             logger.warning(f"🔴 ASR Worker [{engine}] is OFFLINE")
                    
                    self.availability[engine] = is_ok
                    self.latency[engine] = duration if is_ok else -1.0
                    
                    # Cache shared_paths from health response
                    if is_ok:
                        try:
                            data = resp.json()
                            self.shared_paths[engine] = data.get("shared_paths", [])
                            self._last_health[engine] = data
                        except Exception:
                            self.shared_paths[engine] = []
                            self._last_health[engine] = {}
            except Exception:
                if self.availability.get(engine, False):
                     logger.warning(f"🔴 ASR Worker [{engine}] Connection Failed")
                self.availability[engine] = False
                self.latency[engine] = -1.0

        await asyncio.gather(*(check_one(e, self.workers[e]) for e in engines))

    async def start_health_check(self, interval: int = 30):
        """Background task Loop"""
        logger.info("💓 Starting ASR Worker Health Check...")
        while True:
            await self.check_health()
            await asyncio.sleep(interval)

    def get_status(self) -> Dict:
        """Return current status of all engines"""
        status = {}
        # Workers
        for engine, url in self.workers.items():
            status[engine] = {
                "type": "worker",
                "online": self.availability.get(engine, False),
                "latency": self.latency.get(engine, -1),
                "url": url
            }
        # Cloud
        status["bailian"] = {
            "type": "cloud",
            "online": True, 
            "latency": 0
        }
        return {
            "engines": status,
            "config": self.config
        }

    def update_config(self, priority: List[str] = None, strict_mode: bool = None, active_engine: str = None, disabled_engines: List[str] = None):
        """Update runtime config"""
        if priority is not None:
            # Validate engines exist
            valid_prio = [e for e in priority if e in self.workers or e == "bailian"]
            # Add missing engines to end
            for w in self.workers:
                if w not in valid_prio: valid_prio.append(w)
            if "bailian" not in valid_prio: valid_prio.append("bailian")
            
            self.config["priority"] = valid_prio
            
        if strict_mode is not None:
            self.config["strict_mode"] = strict_mode
            
        if active_engine is not None:
            if active_engine in self.workers or active_engine == "bailian":
                self.config["active_engine"] = active_engine

        if disabled_engines is not None:
            self.config["disabled_engines"] = disabled_engines
            
        logger.info(f"⚙️ ASR Config Updated: {self.config}")
        
        # Persist to DB
        self._save_config_to_db()

    def select_worker(self, preferred_engine: str = None) -> str:
        """
        Select the best available worker based on priority and availability.
        If config['strict_mode'] is True, strictly use active_engine.
        Otherwise, use priority list, skipping disabled engines.
        """
        # 1. Determine candidates
        candidates = []
        disabled_list = self.config.get("disabled_engines", [])
        
        # Priority 1: Request specific override (ALWAYS allow if available)
        if preferred_engine:
             candidates.append(preferred_engine)
             return self._check_availability(preferred_engine)
        
        strict = self.config.get("strict_mode", False)
        active = self.config.get("active_engine")

        # Priority 2: Strict Mode or Active Engine
        if strict and active:
             try:
                 return self._check_availability(active)
             except RuntimeError:
                 raise RuntimeError(f"Strict Mode: Active engine '{active}' is offline.")

        # Priority 3: Priority List (Skipping Disabled)
        for e in self.config["priority"]:
            # Skip disabled engines, unless it's the active one (though usually active one shouldn't be disabled)
            if e in disabled_list and e != active:
                continue
                
            if self.availability.get(e, False):
                return e

        # If we reached here, try fallback to active even if it was skipped above
        # This covers cases where active was disabled but strict mode wasn't on,
        # and it's the only available option after checking priority.
        if active and self.availability.get(active, False):
             return active

        raise RuntimeError("No available ASR engines (checked priority list and skipped disabled ones).")

    def _check_availability(self, engine: str) -> str:
         """Helper to check if specific engine is available, raise error if not"""
         if self.availability.get(engine, False):
             return engine
         raise RuntimeError(f"Engine '{engine}' is offline.")

    def _is_localhost(self, engine: str) -> bool:
        """Check if a worker URL points to localhost."""
        url = self.workers.get(engine, "")
        try:
            parsed = urlparse(url)
            host = parsed.hostname or ""
            return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")
        except Exception:
            return False

    def _resolve_path_mode(self, engine: str, audio_path: str) -> tuple:
        """
        Determine if path mode can be used, and resolve the mapped path.
        Returns (can_use: bool, resolved_path: str)
        
        shared_paths supports two formats:
        - Simple list:   ["server_path"] (same path on both machines)
        - Mapping list:  [{"server": "server_path", "worker": "worker_path"}]
        """
        # Localhost = same machine, always path mode, no mapping needed
        if self._is_localhost(engine):
            return True, audio_path
        
        # Check shared_paths declared by the worker
        worker_paths = self.shared_paths.get(engine, [])
        if not worker_paths:
            return False, audio_path
        
        # Normalize audio_path for comparison
        norm_audio = os.path.normpath(os.path.abspath(audio_path))
        
        for sp in worker_paths:
            if isinstance(sp, dict):
                # Mapping format: {"server": "/app/data", "worker": "/mnt/nfs/data"}
                server_prefix = os.path.normpath(os.path.abspath(sp.get("server", "")))
                worker_prefix = sp.get("worker", "")
            else:
                # Simple format: same path on both machines
                server_prefix = os.path.normpath(os.path.abspath(str(sp)))
                worker_prefix = str(sp)
            
            if norm_audio.startswith(server_prefix + os.sep) or norm_audio == server_prefix:
                # Replace server prefix with worker prefix
                relative = norm_audio[len(server_prefix):]
                # Convert path separators to POSIX for remote Linux workers
                mapped = worker_prefix + relative.replace("\\", "/")
                return True, mapped
        
        return False, audio_path

    async def transcribe(self, audio_path: str, engine: str = None, language: str = "zh", prompt: str = None, output_format: str = "text") -> str:
        """
        Transcribe audio using selected engine.
        """
        # Logic: Usage of `engine` param here acts as a "Preferred Engine" override request
        # But we still respect strict/fallback logic via select_worker
        
        try:
             selected_engine = self.select_worker(engine)
        except RuntimeError as e:
             # Re-raise with clear message
             logger.error(f"❌ ASR Selection Failed: {e}")
             raise e

        engine_key = selected_engine.lower()
        logger.info(f"🎤 Transcribing with [{engine_key}] (Requested: {engine})")

        # 1. Cloud Engines (currently: Alibaba DashScope / BaiLian)
        # Future: add other cloud providers here (e.g. "baidu", "iflytek", "tencent")
        if engine_key == "bailian":
             from app.asr.cloud import BaiLianASREngine
             
             # Fetch active config from DB
             db_config = get_active_model_for_engine("bailian")
             api_key = None
             model_name = "paraformer-realtime-v2"  # Default: best general-purpose realtime model
             
             if db_config:
                 try:
                     cfg = json.loads(db_config["config"])
                     api_key = cfg.get("api_key")
                     model_name = cfg.get("model_name", model_name)
                     logger.info(f"☁️ Using Bailian Config: {model_name} (ID: {db_config['id']})")
                 except Exception as e:
                     logger.error(f"❌ Failed to parse Bailian config: {e}")

             cloud_engine = BaiLianASREngine(api_key=api_key, model_name=model_name)
             # DashScope SDK calls are synchronous — run in threadpool to avoid blocking the event loop
             if output_format == "srt":
                 return await run_in_threadpool(cloud_engine.generate_srt, audio_path, language, prompt)
             else:
                 return await run_in_threadpool(cloud_engine.predict, audio_path, language, prompt)

        # 2. Worker Engines
        url = self.workers[engine_key]
        
        can_path, resolved_path = self._resolve_path_mode(engine_key, audio_path)
        if can_path:
            # ── Path mode (shared filesystem or localhost) ──
            payload = {
                "audio_path": resolved_path,
                "language": language,
                "prompt": prompt or "",
                "output_format": output_format
            }
            logger.info(f"📡 Calling Worker [{engine_key}] -> {url}/transcribe (path mode)")
            if resolved_path != audio_path:
                logger.info(f"   Path mapped: {audio_path} -> {resolved_path}")
            
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(f"{url}/transcribe", json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"Worker Error {resp.status_code}: {resp.text}")
                
                data = resp.json()
                return data["text"]
        else:
            # ── Upload mode (stream file to remote worker) ──
            if not self._is_localhost(engine_key):
                logger.warning(f"⚠️ No shared_path matched for '{audio_path}', falling back to upload mode (slower)")
            filename = os.path.basename(audio_path)
            logger.info(f"📤 Uploading to Worker [{engine_key}] -> {url}/transcribe (upload mode, file={filename})")
            
            async with httpx.AsyncClient(timeout=600.0) as client:
                with open(audio_path, "rb") as f:
                    resp = await client.post(
                        f"{url}/transcribe",
                        files={"file": (filename, f, "application/octet-stream")},
                        data={
                            "language": language,
                            "prompt": prompt or "",
                            "output_format": output_format
                        }
                    )
                if resp.status_code != 200:
                    raise RuntimeError(f"Worker Error {resp.status_code}: {resp.text}")
                
                data = resp.json()
                return data["text"]

asr_client = ASRClient()
