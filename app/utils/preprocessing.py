import os
import logging
from app.core.logger import logger

# Optional Dependency for UVR5
try:
    from audio_separator.separator import Separator
    HAS_UVR = True
except ImportError:
    HAS_UVR = False
    logger.warning("⚠️ 'audio-separator' not installed. UVR5 Vocal Separation will be disabled.")

def separate_vocals(audio_path, output_dir=None):
    """
    Separate vocals from audio using UVR5 (audio-separator).
    Returns path to the vocal track.
    
    Args:
        audio_path (str): Path to input audio/video file.
        output_dir (str, optional): Directory to save output. Defaults to audio_path's dir.
        
    Returns:
        str: Path to the separated vocal file.
    """
    if not HAS_UVR:
        logger.warning("❌ UVR5 requested but 'audio-separator' is not installed. Returning original audio.")
        return audio_path

    if not output_dir:
        output_dir = os.path.dirname(audio_path)

    logger.info(f"🎵 Starting Vocal Separation for: {audio_path}")

    # Initialize Separator
    # We use MDX-Net model 'Kim_Vocal_2' as it is generally good for vocals and efficient.
    # log_level is set to ERROR to avoid cluttering our logs, as audio-separator is verbose.
    try:
        separator = Separator(
            log_level=logging.ERROR,
            output_dir=output_dir,
            output_format="wav"
        )

        # Load model (will download on first run)
        logger.info("loading model Kim_Vocal_2.onnx ...")
        separator.load_model(model_filename="Kim_Vocal_2.onnx")

        # Separate
        logger.info("separating ...")
        # Returns list of output files
        output_files = separator.separate(audio_path)
        
        logger.info(f"✅ Separation complete. Output files: {output_files}")

        # Find the vocal track
        # Usually the output files are named like: 'filename_(Vocals)_Kim_Vocal_2.wav'
        # The order returned by separate() is usually [Instrumental, Vocals] for this model, but we should check.
        vocal_track = None
        
        # Heuristic: look for "Vocals" in filename
        for f in output_files:
            if "(Vocals)" in f:
                vocal_track = os.path.join(output_dir, f)
                break
                
        # Fallback: if not found by name, assume it's the 2nd file (common for 2-stem models) or just the last one
        if not vocal_track and output_files:
            vocal_track = os.path.join(output_dir, output_files[-1])
            
        # Clean up non-vocal files (Instrumentals)
        for f in output_files:
            full_path = os.path.join(output_dir, f)
            if full_path != vocal_track:
                try:
                    os.remove(full_path)
                    logger.info(f"🗑️ Cleaned up UVR residual: {f}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to delete UVR residual {f}: {e}")

        return vocal_track
    except Exception as e:
        logger.error(f"❌ UVR5 Processing Failed: {e}")
        return audio_path

def strip_subtitle_metadata(text: str) -> str:
    """
    Remove subtitle sequence numbers and timestamp lines, keeping only text.
    Handles SRT, WebVTT, Whisper raw format, and Bilibili/YouTube inline timestamps.
    """
    import re
    lines = text.splitlines()
    result = []
    
    for line in lines:
        s = line.strip()
        if not s:
            continue
            
        # Pure number sequence line (SRT/WebVTT)
        if re.fullmatch(r'\d+', s):
            continue
            
        # SRT timestamp line: 00:00:00,000 --> 00:00:00,000
        if re.fullmatch(r'\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}.*', s):
            continue
            
        # WebVTT short format: 00:00.000 --> 00:00.000
        if re.fullmatch(r'\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}\.\d{3}.*', s):
            continue
            
        # WebVTT headers
        if s.upper().startswith('WEBVTT') or s.upper().startswith('NOTE'):
            continue
            
        # Whisper inline timestamps: <|0.00|>
        s = re.sub(r'<\|[\d.]+\|>', '', s).strip()
        
        # Inline bracket timestamps: [00:01:23] or (0:01:23)
        s = re.sub(r'[\[\(]\d{1,5}:\d{2}(:\d{2})?\s*[\]\)]', '', s).strip()
        
        if s:
            result.append(s)
            
    return '\n'.join(result)
