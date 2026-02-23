import os
import datetime
from abc import ABC, abstractmethod

# Helper: Format seconds to SRT timestamp
def format_timestamp(seconds: float) -> str:
    td = datetime.timedelta(seconds=seconds)
    # timedelta string is like "0:00:12.345000" or "1 day, 0:00:12.345000"
    # We need HH:MM:SS,mmm
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    millis = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"

# Base Class for ASR Engines
class ASREngine(ABC):
    @abstractmethod
    def predict(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        """Transcribe audio to plain text."""
        pass
    
    @abstractmethod
    def generate_srt(self, audio_path: str, language: str = "zh", initial_prompt: str = None, check_cancel_func=None) -> str:
        """Transcribe audio to SRT format."""
        pass
    
    def load_audio(self, file: str, sr: int = 16000):
        """
        Safe audio loading ensuring no black window pops up on Windows.
        Returns float32 numpy array normalized to [-1, 1].
        """
        import subprocess
        import numpy as np
        
        # FFmpeg command to read audio to stdout as 16-bit PCM
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-threads", "0",
            "-i", file,
            "-f", "s16le",
            "-ac", "1",
            "-acodec", "pcm_s16le",
            "-ar", str(sr),
            "-"
        ]
        
        # Windows-specific logic to hide console window
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
            
        try:
            out = subprocess.run(
                cmd, 
                capture_output=True, 
                startupinfo=startupinfo,
                check=True
            ).stdout
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to load audio: {e.stderr.decode(errors='ignore')}") from e

        return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0
