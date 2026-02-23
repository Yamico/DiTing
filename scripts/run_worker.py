
import os
import argparse
import uvicorn

# Resolve project root (parent of scripts/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run ASR Worker")
    parser.add_argument("--engine", type=str, default=None, choices=["sensevoice", "whisper", "qwen3asr"], help="ASR Engine to load (overrides config)")
    parser.add_argument("--port", type=int, default=None, help="Port to listen on (overrides config)")
    parser.add_argument("--model-path", type=str, default=None, help="Base path for models (overrides config)")
    parser.add_argument("--device", type=str, default=None, help="Device to use, e.g. cuda:0, cpu (overrides config)")
    parser.add_argument("--config", type=str, default=None, help="Path to worker_config.yaml")
    
    args = parser.parse_args()
    
    # CLI args → env vars (highest priority, applied before config loading)
    if args.engine:
        os.environ["ASR_ENGINE"] = args.engine
    if args.port:
        os.environ["PORT"] = str(args.port)
    if args.model_path:
        os.environ["MODEL_BASE_PATH"] = args.model_path
        os.environ["MODELSCOPE_CACHE"] = args.model_path
        os.environ["WHISPER_MODEL_PATH"] = args.model_path
    if args.device:
        os.environ["ASR_DEVICE"] = args.device

    # Load config to get resolved values for display
    import sys
    sys.path.insert(0, os.path.join(PROJECT_ROOT, "asr_worker"))
    from config import load_config
    cfg = load_config(args.config)
    
    engine = cfg["engine"]
    port = cfg["port"]
    device = cfg["device"]
    
    print(f"🔧 Launching ASR Worker [{engine}] on port {port}...")
    print(f"🖥️  Device: {device}")
    if cfg.get("model_base_path"):
        print(f"📂 Model Path: {cfg['model_base_path']}")
    if cfg.get("shared_paths"):
        print(f"📁 Shared Paths: {cfg['shared_paths']}")
    
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, app_dir="asr_worker")
