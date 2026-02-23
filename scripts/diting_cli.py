#!/usr/bin/env python3
"""
DiTing CLI — Standalone Local Transcription Tool

Transcribe local audio/video files directly using ASR engines,
bypassing the DiTing server entirely.

Two modes:
  1. Direct Engine (default): Loads the engine in-process
  2. Worker API (--worker):   Calls a running Worker's HTTP endpoint

Usage:
  # Simple text transcription
  python diting_cli.py video.mp4

  # SRT subtitle output
  python diting_cli.py video.mp4 --format srt

  # Specify engine and language
  python diting_cli.py video.mp4 --engine whisper --lang en

  # Output to file
  python diting_cli.py video.mp4 --format srt -o subtitles.srt

  # Use running Worker API (avoids reloading model)
  python diting_cli.py video.mp4 --worker http://localhost:8001

  # Batch process a directory
  python diting_cli.py D:\\Videos\\ --format srt --ext mp4,mkv
"""

import os
import sys
import json
import time
import argparse
import glob
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Resolve project root (parent of scripts/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ─── Constants ─────────────────────────────────────────────────────────

SUPPORTED_EXTENSIONS = {
    "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv",  # video
    "mp3", "wav", "m4a", "flac", "ogg", "aac", "wma",  # audio
}


def _resolve_default_model_path() -> str:
    """Try to read model_base_path from worker_config.yaml, else fallback."""
    try:
        import yaml
        cfg_path = os.path.join(PROJECT_ROOT, "asr_worker", "worker_config.yaml")
        if os.path.exists(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            base = cfg.get("model_base_path")
            if base and os.path.exists(base):
                return base
    except Exception:
        pass
    # Fallback
    if os.path.exists(r"E:\AI_Models"):
        return r"E:\AI_Models"
    return "models"

DEFAULT_MODEL_BASE = _resolve_default_model_path()


# ─── Worker API Mode ──────────────────────────────────────────────────

def transcribe_via_worker(worker_url: str, audio_path: str, language: str,
                          output_format: str, prompt: str = None) -> str:
    """Call a running Worker's /transcribe HTTP endpoint."""
    abs_path = os.path.abspath(audio_path)
    payload = {
        "audio_path": abs_path,
        "language": language,
        "output_format": output_format,
    }
    if prompt:
        payload["prompt"] = prompt

    url = f"{worker_url.rstrip('/')}/transcribe"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urlopen(req, timeout=3600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("text", "")
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"❌ Worker returned HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"❌ Cannot connect to Worker at {worker_url}: {e.reason}", file=sys.stderr)
        print("   Hint: Is the Worker running? Start it with: python scripts/run_worker.py --engine whisper", file=sys.stderr)
        sys.exit(1)


# ─── Direct Engine Mode ──────────────────────────────────────────────

def load_engine(engine_type: str, model_path: str):
    """Import and initialize the ASR engine in-process."""
    # Add asr_worker to path so we can import engines
    worker_dir = os.path.join(PROJECT_ROOT, "asr_worker")
    if worker_dir not in sys.path:
        sys.path.insert(0, worker_dir)

    # Set env vars that engines expect
    os.environ["WHISPER_MODEL_PATH"] = model_path
    os.environ["MODELSCOPE_CACHE"] = model_path

    print(f"🔧 Loading engine: {engine_type}")
    print(f"📂 Model path: {model_path}")

    start = time.time()

    if engine_type == "whisper":
        from engines.whisper import WhisperEngine
        engine = WhisperEngine(model_path=model_path)
    elif engine_type == "sensevoice":
        from engines.sensevoice import SenseVoiceEngine
        engine = SenseVoiceEngine()
    elif engine_type == "qwen3asr":
        from engines.qwen3asr import Qwen3ASREngine
        engine = Qwen3ASREngine()
    else:
        print(f"❌ Unknown engine: {engine_type}", file=sys.stderr)
        sys.exit(1)

    elapsed = time.time() - start
    print(f"✅ Engine loaded in {elapsed:.1f}s")
    return engine


def transcribe_direct(engine, audio_path: str, language: str,
                      output_format: str, prompt: str = None) -> str:
    """Transcribe using a directly loaded engine instance."""
    abs_path = os.path.abspath(audio_path)

    if output_format in ("srt", "srt_char"):
        if output_format == "srt_char" and hasattr(engine, "generate_srt_char"):
            return engine.generate_srt_char(abs_path, language, prompt)
        return engine.generate_srt(abs_path, language, prompt)
    else:
        return engine.predict(abs_path, language, prompt)


# ─── File Discovery ──────────────────────────────────────────────────

def discover_files(input_path: str, extensions: set) -> list:
    """Resolve input_path to a list of files to process."""
    input_path = os.path.abspath(input_path)

    if os.path.isfile(input_path):
        return [input_path]

    if os.path.isdir(input_path):
        files = []
        for ext in extensions:
            files.extend(glob.glob(os.path.join(input_path, f"*.{ext}")))
        files.sort()
        if not files:
            print(f"⚠️  No matching files found in: {input_path}", file=sys.stderr)
            print(f"   Searched extensions: {', '.join(sorted(extensions))}", file=sys.stderr)
        return files

    print(f"❌ Path not found: {input_path}", file=sys.stderr)
    sys.exit(1)


def default_output_path(input_file: str, output_format: str) -> str:
    """Generate default output filename: input.mp4 → input.srt / input.txt"""
    base = os.path.splitext(input_file)[0]
    ext = ".srt" if output_format.startswith("srt") else ".txt"
    return base + ext


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="DiTing CLI — Transcribe local audio/video files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python diting_cli.py video.mp4                          # text output
  python diting_cli.py video.mp4 --format srt             # SRT subtitles
  python diting_cli.py video.mp4 --engine whisper -o out.srt
  python diting_cli.py video.mp4 --worker http://localhost:8001
  python diting_cli.py D:\\Videos\\ --format srt --ext mp4,mkv  # batch
""",
    )

    parser.add_argument("input", help="Audio/video file or directory to transcribe")
    parser.add_argument("--engine", default="sensevoice",
                        choices=["whisper", "sensevoice", "qwen3asr"],
                        help="ASR engine (default: sensevoice)")
    parser.add_argument("--lang", default="zh",
                        help="Language code: zh, en, ja, ko, yue, auto (default: zh)")
    parser.add_argument("--format", dest="output_format", default="text",
                        choices=["text", "srt", "srt_char"],
                        help="Output format (default: text)")
    parser.add_argument("--prompt", default=None,
                        help="Initial prompt to guide transcription")
    parser.add_argument("-o", "--output", default=None,
                        help="Output file path (default: auto-named or stdout)")
    parser.add_argument("--model-path", default=None,
                        help=f"Model directory (default: {DEFAULT_MODEL_BASE} if exists, else ./models)")
    parser.add_argument("--worker", default=None, metavar="URL",
                        help="Worker API URL (e.g. http://localhost:8001). "
                             "If set, use HTTP mode instead of loading engine locally.")
    parser.add_argument("--ext", default=None,
                        help="File extensions for batch mode, comma-separated "
                             "(default: common audio/video types)")

    args = parser.parse_args()

    # Resolve extensions for batch mode
    if args.ext:
        extensions = {e.strip().lstrip(".") for e in args.ext.split(",")}
    else:
        extensions = SUPPORTED_EXTENSIONS

    # Discover files
    files = discover_files(args.input, extensions)
    if not files:
        sys.exit(1)

    is_batch = len(files) > 1
    if is_batch:
        print(f"📋 Batch mode: {len(files)} files to process")

    # Resolve model path
    model_path = args.model_path or DEFAULT_MODEL_BASE

    # Initialize engine (only for direct mode)
    engine = None
    if not args.worker:
        engine = load_engine(args.engine, model_path)

    # Process files
    for i, filepath in enumerate(files):
        if is_batch:
            print(f"\n{'─' * 60}")
            print(f"📄 [{i+1}/{len(files)}] {os.path.basename(filepath)}")

        start = time.time()

        # Transcribe
        if args.worker:
            result = transcribe_via_worker(
                args.worker, filepath,
                args.lang, args.output_format, args.prompt
            )
        else:
            result = transcribe_direct(
                engine, filepath,
                args.lang, args.output_format, args.prompt
            )

        elapsed = time.time() - start

        # Output
        if is_batch:
            # Batch: always write to file
            out_path = default_output_path(filepath, args.output_format)
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(result)
            print(f"✅ Done in {elapsed:.1f}s → {out_path}")

        elif args.output:
            # Single file with explicit output path
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(result)
            print(f"✅ Done in {elapsed:.1f}s → {args.output}", file=sys.stderr)

        else:
            # Single file, output to stdout
            print(result)
            print(f"\n✅ Done in {elapsed:.1f}s", file=sys.stderr)

    if is_batch:
        print(f"\n{'─' * 60}")
        print(f"🎉 All {len(files)} files processed!")


if __name__ == "__main__":
    main()
