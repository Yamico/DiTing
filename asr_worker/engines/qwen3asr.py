import gc
import logging
import os
import numpy as np
from .base import ASREngine, format_timestamp

logger = logging.getLogger("ASR Worker")

# Language mapping: project standard codes -> Qwen3-ASR language names
LANG_MAP = {
    "zh": "Chinese",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "ru": "Russian",
    "ar": "Arabic",
    "pt": "Portuguese",
    "it": "Italian",
}


class Qwen3ASREngine(ASREngine):
    def __init__(self):
        from config import get_config, get_engine_config
        cfg = get_config()
        ecfg = get_engine_config("qwen3asr")

        device_cfg = cfg.get("device", "cuda:0")

        # Model paths: config > env > default HuggingFace IDs
        model_name = ecfg.get("model_name") or os.getenv("QWEN3_ASR_MODEL") or "Qwen/Qwen3-ASR-1.7B"
        aligner_name = ecfg.get("aligner_name") or os.getenv("QWEN3_ASR_ALIGNER") or "Qwen/Qwen3-ForcedAligner-0.6B"
        use_aligner = ecfg.get("use_aligner", True)
        batch_size = ecfg.get("batch_size", 8)
        max_tokens = ecfg.get("max_tokens", 256)

        logger.info(f"🚀 Loading Qwen3-ASR model: {model_name} (Aligner: {use_aligner})")

        try:
            import torch
            from qwen_asr import Qwen3ASRModel
        except ImportError:
            raise ImportError(
                "Qwen3-ASR dependency 'qwen-asr' not installed. "
                "Please install via: pip install -U qwen-asr"
            )

        # Determine device & dtype
        self._device = device_cfg if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if self._device.startswith("cuda") else torch.float32
        self._torch = torch  # Keep reference for cleanup
        logger.info(f"🖥️ Using Device: {self._device}, Dtype: {dtype}")

        logger.info(f"⚙️ Inference params: batch_size={batch_size}, max_tokens={max_tokens}")

        model_kwargs = dict(
            dtype=dtype,
            device_map=self._device,
            max_inference_batch_size=batch_size,
            max_new_tokens=max_tokens,
        )

        # Optional: ForcedAligner for timestamp support
        if use_aligner:
            model_kwargs["forced_aligner"] = aligner_name
            model_kwargs["forced_aligner_kwargs"] = dict(
                dtype=dtype,
                device_map=self._device,
            )
            logger.info(f"📐 ForcedAligner enabled: {aligner_name}")

        self.model = Qwen3ASRModel.from_pretrained(model_name, **model_kwargs)
        self.use_aligner = use_aligner
        # Log VRAM usage after model load
        if self._device.startswith("cuda") and torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / 1024**3
            reserved = torch.cuda.memory_reserved() / 1024**3
            total = torch.cuda.get_device_properties(0).total_memory / 1024**3
            logger.info(f"✅ Qwen3-ASR loaded | VRAM: {allocated:.1f}GB used / {total:.1f}GB total (reserved: {reserved:.1f}GB)")
        else:
            logger.info("✅ Qwen3-ASR model loaded successfully (CPU mode)")

    def _map_language(self, language: str) -> str | None:
        """Map short code to Qwen3 language name. Returns None for auto-detect."""
        if not language:
            return None
        return LANG_MAP.get(language.lower(), None)

    def predict(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None):
        logger.info(f"📂 [Qwen3-ASR] Processing: {audio_path}")

        if check_cancel_func:
            check_cancel_func()

        qwen_lang = self._map_language(language)

        if check_cancel_func:
            check_cancel_func()

        results = self.model.transcribe(
            audio=audio_path,
            language=qwen_lang,
        )

        if check_cancel_func:
            check_cancel_func()

        # Concatenate all results
        full_text = ""
        for r in results:
            full_text += r.text

        self._cleanup_vram()
        return full_text.strip()

    def generate_srt(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        logger.info(f"📂 [Qwen3-ASR] Generating SRT: {audio_path}")

        if check_cancel_func:
            check_cancel_func()

        qwen_lang = self._map_language(language)

        if check_cancel_func:
            check_cancel_func()

        if self.use_aligner:
            # Use ForcedAligner for accurate timestamps
            results = self.model.transcribe(
                audio=audio_path,
                language=qwen_lang,
                return_time_stamps=True,
            )

            if check_cancel_func:
                check_cancel_func()

            srt_content = ""
            seg_index = 1

            for r in results:
                if not r.time_stamps:
                    # Fallback: no timestamps available, output as single block
                    srt_content += f"{seg_index}\n00:00:00,000 --> 00:00:00,000\n{r.text}\n\n"
                    seg_index += 1
                    continue

                # Group word-level timestamps into sentence-level segments
                # Each time_stamp entry has .text, .start_time, .end_time
                current_text = ""
                seg_start = None
                seg_end = None

                for ts in r.time_stamps:
                    if check_cancel_func:
                        check_cancel_func()

                    if seg_start is None:
                        seg_start = ts.start_time
                    seg_end = ts.end_time
                    current_text += ts.text

                    # Segment on sentence-ending punctuation or every ~15s
                    is_sentence_end = ts.text.rstrip().endswith(("。", ".", "！", "!", "？", "?", "；", ";"))
                    is_long_segment = (seg_end - seg_start) > 15.0

                    if is_sentence_end or is_long_segment:
                        start_str = format_timestamp(seg_start)
                        end_str = format_timestamp(seg_end)
                        srt_content += f"{seg_index}\n{start_str} --> {end_str}\n{current_text.strip()}\n\n"
                        seg_index += 1
                        current_text = ""
                        seg_start = None
                        seg_end = None

                # Flush remaining text
                if current_text.strip() and seg_start is not None:
                    start_str = format_timestamp(seg_start)
                    end_str = format_timestamp(seg_end)
                    srt_content += f"{seg_index}\n{start_str} --> {end_str}\n{current_text.strip()}\n\n"
                    seg_index += 1

            self._cleanup_vram()
            return srt_content
        else:
            # No aligner: output entire text as single SRT entry
            results = self.model.transcribe(
                audio=audio_path,
                language=qwen_lang,
            )

            full_text = ""
            for r in results:
                full_text += r.text

            self._cleanup_vram()
            return f"1\n00:00:00,000 --> 99:59:59,999\n{full_text.strip()}\n\n"

    def generate_srt_char(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        """Generate per-character SRT: each character/word gets its own subtitle entry.
        Useful for later LLM-based sentence regrouping."""
        logger.info(f"📂 [Qwen3-ASR] Generating per-char SRT: {audio_path}")

        if not self.use_aligner:
            logger.warning("⚠️ Per-char SRT requires ForcedAligner. Falling back to standard SRT.")
            return self.generate_srt(audio_path, language, initial_prompt, check_cancel_func)

        if check_cancel_func:
            check_cancel_func()

        qwen_lang = self._map_language(language)

        if check_cancel_func:
            check_cancel_func()

        results = self.model.transcribe(
            audio=audio_path,
            language=qwen_lang,
            return_time_stamps=True,
        )

        if check_cancel_func:
            check_cancel_func()

        srt_content = ""
        seg_index = 1

        for r in results:
            if not r.time_stamps:
                # Fallback: no timestamps, output as single block
                srt_content += f"{seg_index}\n00:00:00,000 --> 00:00:00,000\n{r.text}\n\n"
                seg_index += 1
                continue

            for ts in r.time_stamps:
                if check_cancel_func:
                    check_cancel_func()

                text = ts.text.strip()
                if not text:
                    continue

                start_str = format_timestamp(ts.start_time)
                end_str = format_timestamp(ts.end_time)
                srt_content += f"{seg_index}\n{start_str} --> {end_str}\n{text}\n\n"
                seg_index += 1

        self._cleanup_vram()
        return srt_content

    def _cleanup_vram(self):
        """Release temporary VRAM after inference to prevent accumulation."""
        if self._device.startswith("cuda"):
            gc.collect()
            self._torch.cuda.empty_cache()
