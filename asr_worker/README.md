# DiTing ASR Worker

独立部署的 ASR (Automatic Speech Recognition) 推理服务。作为 DiTing 主服务的计算后端，负责将音频文件转换为带时间戳的文本。

## 特性

- **多引擎支持**：SenseVoice · Whisper · Qwen3-ASR，通过配置一键切换
- **双传输模式**：Path 模式（共享文件系统零拷贝）+ Upload 模式（跨网络流式上传），自动协商
- **GPU 并发控制**：Semaphore 排队机制，防止多请求同时推理导致 OOM
- **独立部署**：可脱离主项目单独运行，适合 GPU 服务器远程部署

---

## 快速开始

### 安装依赖

根据你需要的引擎选择安装：

```bash
# SenseVoice (推荐入门，模型小 ~500MB)
pip install -r requirements-sensevoice.txt

# Whisper (精度高，需要更多显存)
pip install -r requirements-whisper.txt

# Qwen3-ASR (支持逐字级时间戳)
pip install -r requirements-qwen.txt

# 全部引擎
pip install -r requirements.txt
```

### 启动

```bash
# 直接启动 (读取 worker_config.yaml)
python main.py

# 通过根目录启动器 (支持 CLI 参数覆盖)
python run_worker.py --engine sensevoice --port 8001

# Windows 托盘模式 (带日志窗口和进程管理)
python run_worker_tray.py
# 或双击 StartWorkerSilent.vbs (后台静默启动)
```

启动后 Worker 将在 `http://0.0.0.0:8001` 监听请求。

---

## 配置

配置优先级：**环境变量 > worker_config.yaml > 代码默认值**

首次使用 — 从模板创建配置文件：

```bash
cp worker_config.yaml.example worker_config.yaml
# 编辑 worker_config.yaml，设置引擎、端口、模型路径等
```

### worker_config.yaml

```yaml
engine: sensevoice           # 引擎类型: sensevoice | whisper | qwen3asr
port: 8001                   # 监听端口
device: "cuda:0"             # 推理设备: cuda:0 | cuda:1 | cpu
max_concurrency: 1           # GPU 并发数 (1=排队执行, 防 OOM)

shared_paths: []             # 共享路径声明 (见下方说明)
temp_upload_dir: "temp_uploads"

# ★ 模型统一存储目录 — 所有引擎的模型都下载到这里
model_base_path: null        # 如 "/models/ai" 或 "E:\\AI_Models"

models:                      # 各引擎参数 (通常无需修改)
  sensevoice:
    model_id: "iic/SenseVoiceSmall"
    vad_model: "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch"
    vad_max_segment_time: 30000
    cache_dir: null           # 默认继承 model_base_path
  whisper:
    model_name: "large-v3-turbo"
    download_root: null       # 默认继承 model_base_path
  qwen3asr:
    model_name: "Qwen/Qwen3-ASR-1.7B"
    aligner_name: "Qwen/Qwen3-ForcedAligner-0.6B"
    use_aligner: true
    batch_size: 8
```

#### 模型路径统一管理

`model_base_path` 是管理所有模型存储位置的**唯一入口**。设置后自动向下传播：

```
model_base_path: "E:\AI_Models"
    │
    ├─► MODELSCOPE_CACHE=E:\AI_Models    → SenseVoice (FunASR/ModelScope)
    ├─► WHISPER_MODEL_PATH=E:\AI_Models  → Whisper (download_root)
    └─► HF_HOME=E:\AI_Models            → Qwen3-ASR (HuggingFace Hub)
```

如果某个引擎需要单独指定路径，可以在 `models.<engine>` 中覆盖（如 `cache_dir`、`download_root`），但通常不需要。

#### 各引擎的实际存储结构

三个引擎的底层模型管理库不同，下载后的目录结构也不同：

```
E:\AI_Models\
├── models\                                    # ← ModelScope SDK 自动创建
│   └── iic\
│       ├── SenseVoiceSmall\                   #   SenseVoice 模型 (~500MB)
│       └── speech_fsmn_vad_zh-cn-16k-common-pytorch\  # VAD 模型
├── hub\                                       # ← HuggingFace Hub 自动创建
│   ├── models--Qwen--Qwen3-ASR-1.7B\         #   Qwen3-ASR 主模型
│   └── models--Qwen--Qwen3-ForcedAligner-0.6B\  # Forced Aligner
└── large-v3-turbo.pt                          # ← Whisper 直接存放 .pt 文件
```

**为什么差别这么大？** 因为三个引擎依赖了三个不同生态的模型管理库：

| 引擎 | 模型来源 | 管理库 | 缓存行为 |
|------|---------|-------|---------|
| SenseVoice | [ModelScope](https://modelscope.cn) | `modelscope` SDK | 在根目录下创建 `models/{org}/{name}/`，带版本快照 |
| Whisper | [OpenAI](https://github.com/openai/whisper) | 自研下载器 | 直接在根目录下存放单个 `.pt` 权重文件，无子目录 |
| Qwen3-ASR | [HuggingFace](https://huggingface.co) | `huggingface_hub` | 在根目录下创建 `hub/models--{org}--{name}/`，带 blobs/snapshots |

简单说：ModelScope 是阿里的模型托管平台、HuggingFace 是国际主流平台、Whisper 则是 OpenAI 自己实现的简单下载器。三者各自有自己的缓存文件组织方式，但 **子目录不会冲突**，可以安全地共用同一个 `model_base_path`。

### 环境变量

| 环境变量 | 对应配置项 | 说明 |
|---------|-----------|------|
| `ASR_ENGINE` | engine | 引擎类型 |
| `PORT` | port | 监听端口 |
| `ASR_DEVICE` | device | 推理设备 |
| `MAX_CONCURRENCY` | max_concurrency | GPU 并发数 |
| `MODEL_BASE_PATH` | model_base_path | **模型统一存储目录** |
| `SHARED_PATHS` | shared_paths | 共享路径（简单格式，逗号分隔） |
| `MODELSCOPE_CACHE` | models.sensevoice.cache_dir | SenseVoice 单独覆盖 |
| `WHISPER_MODEL_PATH` | models.whisper.download_root | Whisper 单独覆盖 |
| `HF_HOME` | — | Qwen3-ASR 单独覆盖 |

---

## 共享目录机制 (Shared Paths)

### 问题背景

DiTing 主服务调用 Worker 进行转写时，需要告诉 Worker 音频文件的位置。当两者在同一台机器上时，直接传文件路径即可（零拷贝，最快）。但当 Worker 部署在另一台机器时：

- 路径可能不可达（不同文件系统）
- 即使是同一个 NFS/SMB 共享目录，**不同主机的挂载点往往不同**

### 解决方案：自动探测 + 路径映射

Worker 端声明它能访问的路径，以及这些路径在主服务端对应的位置。主服务自动协商传输模式：

```
┌──────────────────┐                       ┌──────────────────┐
│   Main Server    │                       │    ASR Worker     │
│ DATA_DIR=/app/data│  ── Path 模式 ────►  │ 挂载在 /mnt/nfs   │
│                  │     (路径自动映射)      │                  │
│                  │  ── Upload 模式 ──►   │ (无共享存储时)     │
│                  │     (文件流式上传)      │                  │
└──────────────────┘                       └──────────────────┘
```

**自动协商流程：**

1. Worker 在 `/health` 响应中声明路径映射关系
2. 主服务缓存每个 Worker 的映射表
3. 转写时自动判断：
   - 音频路径命中映射 → **Path 模式**：替换前缀后发送给 Worker
   - 未命中 → **Upload 模式**：将文件流式上传到 Worker

### 配置格式

`shared_paths` 支持两种格式：

**简单格式**（两端路径完全一致）：

```yaml
# 两台机器都将 NFS 挂载到了 /data
shared_paths:
  - "/data"
```

**映射格式**（两端路径不同，常见场景）：

```yaml
# 主服务: /app/data/audio.wav
# Worker: /mnt/nfs/data/audio.wav
shared_paths:
  - server: "/app/data"      # 主服务端的路径前缀
    worker: "/mnt/nfs/data"  # Worker 端的实际挂载路径
```

两种格式可以混用：

```yaml
shared_paths:
  - "/shared/common"                           # 两边路径一致
  - server: "/app/data"                        # 主服务看到的路径
    worker: "/mnt/nfs/data"                    # Worker 看到的路径
  - server: "D:\\data"                         # Windows 主服务
    worker: "/home/gpu/smb_mount/data"         # Linux Worker
```

### 配置示例

**场景 A：同机部署（默认）**

```yaml
# 不需要配置。Localhost 自动走 Path 模式，无需映射
shared_paths: []
```

**场景 B：NFS 共享，但挂载路径不同**

主服务在 Docker 容器中，数据目录为 `/app/data`；Worker 在 GPU 服务器上，同一 NFS 挂载到 `/mnt/nas/diting`：

```yaml
shared_paths:
  - server: "/app/data"
    worker: "/mnt/nas/diting"
```

转写时：`/app/data/temp_downloads/audio.wav` → 自动映射为 `/mnt/nas/diting/temp_downloads/audio.wav`

**场景 C：Windows 主服务 + Linux Worker**

主服务在 Windows PC，数据在 `D:\DiTing\data`；Worker 在 Linux GPU 服务器，SMB 挂载到 `/mnt/smb/diting_data`：

```yaml
shared_paths:
  - server: "D:\\DiTing\\data"
    worker: "/mnt/smb/diting_data"
```

路径分隔符会自动转换（`\` → `/`）。

**场景 D：完全跨网络（无共享存储）**

```yaml
# shared_paths 留空，所有请求自动走 Upload 模式
shared_paths: []
```

主服务会通过 HTTP multipart 上传音频到 Worker 的临时目录，转写完成后自动清理。

---

## API 接口

### GET /health

健康检查，返回引擎状态、GPU 信息和队列状态。

```json
{
  "status": "ok",
  "engine": "sensevoice",
  "loaded": true,
  "gpu": {
    "name": "NVIDIA GeForce RTX 4090",
    "total_gb": 24.0,
    "allocated_gb": 1.85,
    "reserved_gb": 2.0
  },
  "shared_paths": ["/data"],
  "concurrency": { "max": 1, "queue": 0 }
}
```

### POST /transcribe

统一转写端点，通过 `Content-Type` 自动区分模式：

**Path 模式** (`application/json`)：
```json
{
  "audio_path": "/data/audio/test.wav",
  "language": "zh",
  "output_format": "srt",
  "prompt": null
}
```

**Upload 模式** (`multipart/form-data`)：
```
file: <binary>
language: zh
output_format: srt
```

**output_format 选项：**
| 值 | 说明 |
|----|------|
| `text` | 纯文本（带时间戳标记） |
| `srt` | SRT 字幕格式 |
| `srt_char` | 逐字级 SRT（仅 Qwen3-ASR 支持） |

**响应：**
```json
{
  "text": "1\n00:00:00,000 --> 00:00:03,500\n大家好...",
  "engine": "sensevoice"
}
```

### GET /gpu-status

详细 GPU 显存监控：

```json
{
  "available": true,
  "device": "NVIDIA GeForce RTX 4090",
  "total_gb": 24.0,
  "allocated_gb": 1.85,
  "free_gb": 22.15,
  "peak_gb": 3.42
}
```

---

## 目录结构

```
asr_worker/
├── main.py                  # FastAPI 服务入口
├── config.py                # 配置加载 (YAML + 环境变量合并)
├── worker_config.yaml       # 默认配置文件
├── worker_logger.py         # 日志配置
├── engines/                 # ASR 引擎实现
│   ├── base.py              #   引擎基类
│   ├── sensevoice.py        #   FunASR SenseVoice
│   ├── whisper.py           #   OpenAI Whisper
│   └── qwen3asr.py          #   Qwen3-ASR (含 Forced Aligner)
├── requirements-common.txt  # 公共依赖
├── requirements-sensevoice.txt
├── requirements-whisper.txt
├── requirements-qwen.txt
├── requirements.txt         # 全部引擎依赖
├── run_worker_tray.py       # Windows 系统托盘启动器
├── StartWorkerSilent.vbs    # Windows 静默启动脚本
└── temp_uploads/            # Upload 模式的临时文件目录 (自动清理)
```

---

## 运行多个 Worker

可以在同一台机器上运行多个不同引擎的 Worker：

```bash
# 终端 1: SenseVoice on :8001
ASR_ENGINE=sensevoice PORT=8001 python main.py

# 终端 2: Whisper on :8002
ASR_ENGINE=whisper PORT=8002 python main.py
```

然后在主服务的 `.env` 中配置：

```
ASR_WORKERS={"sensevoice":"http://localhost:8001","whisper":"http://localhost:8002"}
```
