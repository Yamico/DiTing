"""
Cloud ASR Engine — Alibaba Cloud DashScope (百炼)

Supports three DashScope API categories, each with different models:

1. Recognition (实时流式识别) — WebSocket streaming, accepts local files
   Models: paraformer-realtime-v2, fun-asr-realtime, qwen3-asr-flash-realtime, etc.

2. MultiModalConversation (多模态对话) — HTTP call, accepts file:// local paths
   Models: qwen3-asr-flash, qwen-audio-asr
   Note: No sentence-level timestamps available; SRT output is limited.

3. Transcription (录音文件转写) — Async task, requires PUBLIC URL (not local file)
   Models: paraformer-v2, fun-asr, Qwen3-ASR-Flash-Filetrans
   Note: NOT implemented in Phase 1 (local file workflow incompatible).

Architecture Note:
    This module is designed for extensibility. Future cloud ASR providers
    (e.g. Baidu, iFlytek, Tencent) can be added as separate engine classes
    inheriting from ASREngine and registered in asr_client.py.
"""

import os
import json
import uuid
import subprocess
from http import HTTPStatus
from typing import Optional

import dashscope
from dashscope import MultiModalConversation
from dashscope.audio.asr import (
    Recognition,
    RecognitionCallback,
    RecognitionResult,
)

from app.asr.wrapper import ASREngine, format_timestamp
from app.core.logger import logger

# --- Model Routing Tables ---
# Each model must be mapped to exactly one API strategy.
# Use lowercase for matching; user input is normalized to lowercase.

RECOGNITION_MODELS = {
    # Paraformer realtime series
    "paraformer-realtime-v2",
    "paraformer-realtime-8k-v2",
    "paraformer-realtime-v1",
    "paraformer-realtime-8k-v1",
    # Fun-ASR realtime
    "fun-asr-realtime",
    # Qwen3 realtime
    "qwen3-asr-flash-realtime",
}

MULTIMODAL_MODELS = {
    # Qwen audio models (file:// local path supported)
    "qwen3-asr-flash",
    "qwen-audio-asr",
}

TRANSCRIPTION_MODELS = {
    # These require public URL — NOT supported in current workflow
    "paraformer-v2",
    "paraformer-8k-v2",
    "paraformer-v1",
    "paraformer-8k-v1",
    "paraformer-mtl-v1",
    "fun-asr",
    "qwen3-asr-flash-filetrans",
    "sensevoice-v1",  # Deprecated by Alibaba, listed for reference
}

# Default WebSocket endpoint (Beijing region)
DEFAULT_DASH_WEBSOCKET_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'


def _resolve_api_strategy(model_name: str) -> str:
    """
    Determine which DashScope API to use for a given model name.
    Returns: 'recognition', 'multimodal', or 'transcription'.
    Raises ValueError for unsupported models.
    """
    name = model_name.lower().strip()

    if name in RECOGNITION_MODELS:
        return "recognition"
    if name in MULTIMODAL_MODELS:
        return "multimodal"
    if name in TRANSCRIPTION_MODELS:
        return "transcription"

    # Heuristic fallback: if model name contains 'realtime', assume Recognition
    if "realtime" in name:
        logger.warning(
            f"⚠️ 未知模型 '{model_name}' 包含 'realtime'，降级使用 Recognition API"
        )
        return "recognition"

    # Unknown model — default to Recognition with warning
    logger.warning(
        f"⚠️ 未知模型 '{model_name}' 不在已知列表中，降级使用 Recognition API。"
        f" 已知模型: {sorted(RECOGNITION_MODELS | MULTIMODAL_MODELS)}"
    )
    return "recognition"


class BaiLianASREngine(ASREngine):
    """
    Unified Engine for Alibaba Cloud DashScope.
    Dispatches to the correct API based on model name.
    """

    def __init__(self, api_key: Optional[str] = None, model_name: str = "paraformer-realtime-v2"):
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "❌ 未找到 DASHSCOPE_API_KEY。请在 Settings 中配置或设置环境变量。"
            )

        dashscope.api_key = self.api_key

        # WebSocket endpoint (for Recognition API)
        self.websocket_url = os.getenv("DASHSCOPE_WEBSOCKET_URL", DEFAULT_DASH_WEBSOCKET_URL)
        dashscope.base_websocket_api_url = self.websocket_url

        self.model_name = model_name.strip()

        # Resolve API strategy
        self.api_strategy = _resolve_api_strategy(self.model_name)

        # Block unsupported Transcription models early
        if self.api_strategy == "transcription":
            raise ValueError(
                f"❌ 模型 '{self.model_name}' 使用 Transcription API，"
                f"需要公网 URL 作为输入，当前不支持本地文件。"
                f" 请使用实时模型如 paraformer-realtime-v2 或 qwen3-asr-flash。"
            )

        strategy_labels = {
            "recognition": "⚡ 实时流式 (Recognition)",
            "multimodal": "🧠 多模态对话 (MultiModal)",
        }
        logger.info(
            f"☁️ [BaiLian] 初始化: {self.model_name} | "
            f"策略: {strategy_labels.get(self.api_strategy, self.api_strategy)}"
        )

    # ==================== Audio Preprocessing ====================

    def _ensure_mono_16k(self, audio_path: str) -> str:
        """Convert audio to 16kHz mono WAV for Recognition API."""
        temp_path = os.path.join(
            os.path.dirname(audio_path),
            f"ds_temp_{uuid.uuid4()}.wav"
        )
        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", audio_path,
            "-ac", "1", "-ar", "16000",
            temp_path
        ]

        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        try:
            subprocess.run(cmd, check=True, startupinfo=startupinfo)
            return temp_path
        except Exception as e:
            logger.warning(f"⚠️ FFmpeg 转换失败，使用原始文件: {e}")
            return audio_path

    # ==================== Public Interface ====================

    def predict(self, audio_path: str, language: str = "zh",
                initial_prompt: str = None, check_cancel_func=None) -> str:
        try:
            if self.api_strategy == "multimodal":
                return self._multimodal_predict(audio_path, check_cancel_func)
            else:
                return self._recognition_predict(audio_path, check_cancel_func)
        except Exception as e:
            if "cancel" in str(type(e).__name__).lower():
                raise  # Re-raise cancellation exceptions
            logger.error(f"❌ BaiLian predict 失败: {e}")
            return f"Error: {str(e)}"

    def generate_srt(self, audio_path: str, language: str = "zh",
                     initial_prompt: str = None, check_cancel_func=None) -> str:
        try:
            if self.api_strategy == "multimodal":
                return self._multimodal_srt(audio_path, check_cancel_func)
            else:
                return self._recognition_srt(audio_path, check_cancel_func)
        except Exception as e:
            if "cancel" in str(type(e).__name__).lower():
                raise
            logger.error(f"❌ BaiLian generate_srt 失败: {e}")
            return ""

    # ==================== Strategy: Recognition (Realtime) ====================

    def _recognition_call(self, audio_path: str, check_cancel_func=None):
        """Core Recognition API call. Returns the raw result object."""
        if check_cancel_func:
            check_cancel_func()

        safe_path = self._ensure_mono_16k(audio_path)
        is_temp = (safe_path != audio_path)

        class _Callback(RecognitionCallback):
            def on_event(self, result: RecognitionResult) -> None:
                pass

            def on_complete(self) -> None:
                pass

            def on_error(self, result: RecognitionResult) -> None:
                logger.error(f"BaiLian Recognition 回调错误: {result.message}")

        try:
            rec = Recognition(
                model=self.model_name,
                format='wav',
                sample_rate=16000,
                callback=_Callback()
            )
            result = rec.call(file=safe_path)

            if check_cancel_func:
                check_cancel_func()

            return result
        finally:
            if is_temp and os.path.exists(safe_path):
                try:
                    os.remove(safe_path)
                except OSError:
                    pass

    def _recognition_predict(self, audio_path: str, check_cancel_func=None) -> str:
        res = self._recognition_call(audio_path, check_cancel_func)
        if res.status_code == HTTPStatus.OK:
            if res.output and 'sentence' in res.output:
                return "".join(s['text'] for s in res.output['sentence'])
            return ""
        return f"Error: {res.code} - {res.message}"

    def _recognition_srt(self, audio_path: str, check_cancel_func=None) -> str:
        res = self._recognition_call(audio_path, check_cancel_func)
        if res.status_code == HTTPStatus.OK:
            srt_lines = []
            if res.output and 'sentence' in res.output:
                for idx, s in enumerate(res.output['sentence'], 1):
                    start = s['begin_time'] / 1000.0
                    end = s['end_time'] / 1000.0
                    srt_lines.append(
                        f"{idx}\n{format_timestamp(start)} --> {format_timestamp(end)}\n{s['text']}\n"
                    )
            return "\n".join(srt_lines)
        return ""

    # ==================== Strategy: MultiModalConversation (Qwen) ====================

    def _build_multimodal_messages(self, audio_path: str) -> list:
        """Build the messages payload for MultiModalConversation."""
        abs_path = os.path.abspath(audio_path).replace("\\", "/")
        file_url = f"file://{abs_path}"
        return [
            {"role": "user", "content": [{"audio": file_url}]}
        ]

    def _extract_multimodal_text(self, response) -> str:
        """Extract text from MultiModalConversation response."""
        content = response.output.choices[0].message.content
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and 'text' in part:
                    parts.append(part['text'])
                elif isinstance(part, str):
                    parts.append(part)
            return "".join(parts)
        return str(content) if content else ""

    def _multimodal_predict(self, audio_path: str, check_cancel_func=None) -> str:
        if check_cancel_func:
            check_cancel_func()

        logger.info(f"🧠 [MultiModal] 调用 {self.model_name}")

        response = MultiModalConversation.call(
            model=self.model_name,
            messages=self._build_multimodal_messages(audio_path),
            result_format="message",
        )

        if check_cancel_func:
            check_cancel_func()

        if response.status_code == HTTPStatus.OK:
            return self._extract_multimodal_text(response)
        return f"Error: {response.code} - {response.message}"

    def _multimodal_srt(self, audio_path: str, check_cancel_func=None) -> str:
        """
        MultiModalConversation API does NOT provide sentence-level timestamps.
        We generate a single-entry SRT with the full text as a graceful degradation.
        """
        if check_cancel_func:
            check_cancel_func()

        logger.info(f"🧠 [MultiModal] 调用 {self.model_name} (SRT 模式 — 无时间戳)")
        logger.warning(
            f"⚠️ 模型 '{self.model_name}' 使用 MultiModal API，"
            f"不支持句级时间戳。SRT 输出为单条字幕。"
            f" 如需精确时间戳，请使用 paraformer-realtime-v2。"
        )

        response = MultiModalConversation.call(
            model=self.model_name,
            messages=self._build_multimodal_messages(audio_path),
            result_format="message",
        )

        if check_cancel_func:
            check_cancel_func()

        if response.status_code == HTTPStatus.OK:
            text = self._extract_multimodal_text(response)
            if text:
                # Single-entry SRT spanning a placeholder duration
                return f"1\n00:00:00,000 --> 99:59:59,999\n{text}\n"
            return ""
        else:
            logger.error(f"MultiModal 错误: {response.message}")
            return ""
