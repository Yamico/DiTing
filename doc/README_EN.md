<div align="center">

# DiTing

**Your Private Video Knowledge Base — Local ASR · AI Analysis · Immersive Reading**

[![Status](https://img.shields.io/badge/Status-Active-success)](https://github.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

</div>

> **DiTing** (谛听), a mythical beast in Buddhist mythology, the mount of Ksitigarbha Bodhisattva. Legend has it that "DiTing is good at distinguishing the voices of all things in the world; by listening to the ground, it can know everything."
> We chose this name to represent this project's accurate recognition and deep understanding of audio and video content.

<div align="center">
  <img src="doc/assets/demo.png" alt="DiTing Demo" width="90%">
  <img src="doc/assets/demo02.png" alt="DiTing Detail" width="90%">
</div>

---

## Introduction

DiTing is a **self-hosted, local-first** video knowledge base system. It can convert videos from platforms like Bilibili, YouTube, Douyin (and local media files) into searchable, analyzable, and annotatable structured text assets.

Core concept: **Collect → Transcribe → Analyze → Accumulate**, turning fragmented video information into your private knowledge base.

### What can it do?

| Feature | Description |
|---------|-------------|
| 🎙️ **Multi-Engine ASR** | SenseVoice · Whisper · Qwen3-ASR · Alibaba Cloud Bailian, one-click switching |
| 📺 **Platform Integration** | Direct paste of Bilibili / YouTube / Douyin URLs, automatic download, subtitle extraction, and transcription |
| 🧠 **AI Analysis** | Connects to any OpenAI-compatible LLM for structured summaries, follow-up questions, and mind maps of the transcribed text |
| 📌 **Browser Companion** | Userscript embeds the transcription panel into Bilibili/Douyin playback pages for lyric-style synchronized reading |
| 🏷️ **Knowledge Management** | Tag system, Markdown notes, full-text search to build a private video knowledge base |
| 💾 **Smart Cache** | Multi-quality caching, automatic expiration cleanup (GC), separate retention policies per video |

---

## System Architecture

DiTing adopts a **Server + Worker** separated architecture. The main service does not load AI models, and ASR inference is completed by independent Worker processes.

```text
┌─────────────┐     HTTP      ┌──────────────────┐     HTTP     ┌─────────────────┐
│  React SPA  │ ◄──────────►  │   Main Server    │ ◄──────────► │   ASR Workers   │
│  :5023/app  │               │   FastAPI :5023   │              │  :8001 / :8002  │
└─────────────┘               │   SQLite · GC     │              │  :8003 / Cloud  │
                              └──────────────────┘              └─────────────────┘
┌─────────────┐                       ▲
│ Userscript  │ ──── localhost ────────┘
│ (Bilibili)  │
└─────────────┘
```

- **Single Machine Deployment**: Server and Worker on the same machine, unified management via `scripts/run_tray.py`.
- **Cross-Machine Deployment**: Worker runs on a GPU server, Server invokes it remotely by configuring the `ASR_WORKERS` dictionary.
- **Docker Deployment**: Provides `docker-compose.yml`, suitable for intranet microservice mounting.

### Directory Structure

```text
DiTing/
├── app/                    # Backend Main Service (FastAPI)
│   ├── api/v1/endpoints/   #   REST API Routes (system, system_cache, library, segments, videos, ...)
│   ├── services/           #   Business Logic Layer (video_service, media_cache, llm, ...)
│   ├── asr/client.py       #   ASR Worker Client
│   └── core/config.py      #   Service Config (pydantic-settings, reads .env)
├── frontend/               # React Frontend (Vite + TypeScript)
├── asr_worker/             # ASR Inference Worker (Independent process)
│   ├── engines/            #   Engine Implementations (sensevoice/whisper/qwen3asr)
│   ├── config.py           #   Worker Config Loader (reads worker_config.yaml)
│   ├── worker_config.yaml.example  # Config Template (→ cp to worker_config.yaml)
│   └── run_worker_tray.py  #   Worker Independent Tray (for remote GPU deployment)
├── scripts/                # PC Desktop Deployment Tools
│   ├── run_tray.py         #   System Tray (Manages Server + Worker processes)
│   ├── run_worker.py       #   Worker CLI Launcher
│   ├── diting_cli.py       #   CLI Transcription Tool
│   └── StartSilent.vbs     #   Silent Start (Double-click to run)
├── .env.example            # Docker Deployment Config Template
├── docker-compose.yml      # Docker Compose File
├── userscripts/            # Browser Userscript (Tampermonkey)
└── doc/                    # Project Documentation
```

---

## Quick Start

### Requirements

- **Python 3.10+**
- **FFmpeg** (Must be in system PATH, or placed in the `bin/` directory)
- **Node.js 18+** (Only needed when modifying the frontend)
- **CUDA GPU** (Required for local ASR inference; not required for pure cloud mode)

### Installation

```bash
git clone <repository_url> DiTing
cd DiTing
cp .env.example .env         # Modify environment variables as needed
```

Choose the installation method according to your use case:

```bash
# PC Desktop — Full Installation (Web Service + All ASR Engines)
uv sync --extra all

# PC Desktop — On-Demand Installation (e.g., using only SenseVoice)
uv sync --extra worker --extra sensevoice

# Pure Web Service (ASR provided by remote Worker or Cloud)
uv sync
```

### Starting

```bash
# Method 1: System Tray (Recommended for Windows, automatically manages Server + Worker processes)
# Double-click scripts/StartSilent.vbs, or:
uv run python scripts/run_tray.py

# Method 2: Start separately
uv run python app/server.py                                # Main Service (:5023)
uv run python scripts/run_worker.py --engine sensevoice    # ASR Worker (:8001)
```

After starting, visit **http://localhost:5023/app/** to enter the Dashboard.

> [!TIP]
> ASR engines will automatically download models upon the first run.
>
> SenseVoice model is smaller (~500MB) and suitable for a quick experience;
> Whisper Large V3 Turbo has higher accuracy but requires more VRAM;
> Qwen3-ASR is not yet optimized. It easily causes OOM for audio longer than 10 mins, so use with caution.

---

## Browser Companion (Userscript)

The companion Userscript can embed DiTing's capabilities into the native playback pages of Bilibili/Douyin.

### Installation
1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Copy the contents of `userscripts/userscript.js` into a newly created Tampermonkey script.
3. Allow the script to access `localhost:5023` upon its first use.

### Main Features
- **📌 Embedded Mode**: The panel automatically embeds into the Bilibili right sidebar, with height synced to the video player.
- **🎵 Synchronized Lyrics**: The current playback position automatically highlights the corresponding text. Click to jump precisely.
- **🤖 Instant AI**: Ask AI questions directly about the video content in the sidebar.

---

## Docker Deployment

The Docker image only includes the Web service (without ASR engines). ASR is provided by remote Workers or the Cloud.

```bash
# 1. Place the Linux version of ffmpeg/ffprobe into bin/linux/
# 2. Build and start
docker compose up -d
```

In `docker-compose.yml`, point to the GPU node via the `ASR_WORKERS` environment variable:

```yaml
environment:
  - ASR_WORKERS={"sensevoice":"http://gpu-server:8001","whisper":"http://gpu-server:8002"}
```

### Remote Worker Deployment

On the GPU server, you only need to deploy the `asr_worker/` directory:

```bash
cd asr_worker
pip install -r requirements-sensevoice.txt   # Choose based on the engine
python main.py                               # Default :8001
```

See `asr_worker/worker_config.yaml.example` for Worker configuration (need to `cp` to `worker_config.yaml` for the first use).

---

## FAQ

<details>
<summary><b>Browser script panel position is abnormal</b></summary>

Bilibili frequently updates its frontend DOM structure, causing the script's mounting container to occasionally shift.
Solution: Click the minimize button `−` on the panel, then expand it again to trigger a height recalculation.
</details>

<details>
<summary><b>Out of Memory (OOM) during transcription</b></summary>

Check if multiple ASR Workers are running simultaneously. It is recommended to run only one GPU Worker at a time.
You can also reduce the `batch_size` parameter in the Worker's configuration.
</details>

<details>
<summary><b>Cache files keep growing</b></summary>

Go to Dashboard → Settings → System → Management Center to configure the automatic cleanup policy (e.g., "Keep for 7 days"),
or manually review and delete expired files in the Clean up tab.
</details>

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python · FastAPI · Uvicorn · SQLite |
| **Frontend** | React 18 · TypeScript · TailwindCSS · React Query |
| **ASR** | FunASR (SenseVoice) · OpenAI Whisper · Qwen3-ASR · Alibaba Cloud Bailian |
| **Tools** | yt-dlp · FFmpeg · pystray · uv |

---

## License

[MIT](LICENSE)
