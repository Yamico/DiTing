import logging
import os
import re
from .base import ASREngine, format_timestamp

logger = logging.getLogger("ASR Worker")

class SenseVoiceEngine(ASREngine):
    def __init__(self):
        from config import get_config, get_engine_config
        cfg = get_config()
        ecfg = get_engine_config("sensevoice")

        device = cfg.get("device", "cuda:0")
        model_id = ecfg.get("model_id", "iic/SenseVoiceSmall")
        vad_model = ecfg.get("vad_model", "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch")
        vad_max_seg = ecfg.get("vad_max_segment_time", 30000)
        cache_dir = ecfg.get("cache_dir") or os.getenv("MODELSCOPE_CACHE")

        logger.info(f"🚀 Loading SenseVoice model: {model_id} (device={device}, cache={cache_dir})")
        try:
            from funasr import AutoModel
        except ImportError:
            raise ImportError("SenseVoice dependency 'funasr' not installed. Please install 'funasr modelscope'.")

        self.model = AutoModel(
            model=model_id,
            vad_model=vad_model,
            vad_kwargs={"max_single_segment_time": vad_max_seg},
            device=device,
            trust_remote_code=True,
            disable_update=True,
        )

    def clean_text(self, text: str) -> str:
        # 1. Keep SenseVoice tags (<|HAPPY|>, <|zh|>, etc.) but remove sound events
        text = re.sub(r'<\|(BGM|Speech|Applause|Laughter|Cry|Music|Bird|Bell)\|>', '', text, flags=re.IGNORECASE)
        
        # 2. Remove emojis
        text = re.sub(r'[\U00010000-\U0010ffff]', '', text) 
        
        # 3. Remove square brackets
        text = re.sub(r'\[.*?\]', '', text)
        
        return text.strip()

    def predict(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None):
        logger.info(f"📂 [SenseVoice] Processing: {audio_path}")
        
        if check_cancel_func: check_cancel_func()

        audio_data = self.load_audio(audio_path)
        
        if check_cancel_func: check_cancel_func()
        
        if len(audio_data) < 1600: # Less than 0.1s
             logger.warning(f"⚠️ Audio too short: {audio_path}")
             return ""
        
        res = self.model.generate(
            input=audio_data,
            cache={},
            language=language,
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        full_text = ""
        for item in res:
            full_text += self.clean_text(item.get('text', ''))
        return full_text

    def generate_srt(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        logger.info(f"📂 [SenseVoice] Generating SRT: {audio_path}")
        
        if check_cancel_func: check_cancel_func()
        audio_data = self.load_audio(audio_path)

        if check_cancel_func: check_cancel_func()
        res = self.model.generate(
            input=audio_data,
            cache={},
            language=language,
            use_itn=True,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        
        srt_content = ""
        for i, item in enumerate(res):
            if check_cancel_func: check_cancel_func()
            text = self.clean_text(item.get('text', ''))
            ts_list = item.get('timestamp', [])
            
            start_ms = ts_list[0][0] if ts_list else 0
            end_ms = ts_list[-1][1] if ts_list else 0
            
            start_str = format_timestamp(start_ms / 1000.0)
            end_str = format_timestamp(end_ms / 1000.0)
            
            srt_content += f"{i+1}\n{start_str} --> {end_str}\n{text}\n\n"
            
        return srt_content
