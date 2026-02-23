from abc import ABC, abstractmethod

def format_timestamp(seconds: float) -> str:
    """Format seconds to HH:MM:SS,mmm for SRT"""
    ms = int((seconds - int(seconds)) * 1000)
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

class ASREngine(ABC):
    @abstractmethod
    def predict(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        pass

    @abstractmethod
    def generate_srt(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        pass
