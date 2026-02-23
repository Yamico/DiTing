import logging
import os
import sys
import json
from logging.handlers import RotatingFileHandler
from datetime import datetime

# --- Configuration ---
# Logs will be saved to the parent project's 'logs' directory
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)


class JSONFormatter(logging.Formatter):
    """
    Format logs as JSON lines.
    Includes: timestamp, level, name, message, and extra fields.
    """
    def format(self, record):
        log_record = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno
        }
        
        # Add basic exception info if present
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_record, ensure_ascii=False)

class ConsoleFormatter(logging.Formatter):
    """
    Human readable formatter for Console/Tray.
    """
    def format(self, record):
        # Standard format: [LEVEL] Message
        # We can keep it simple as the Tray app might prefix it too
        return super().format(record)

def setup_worker_logger(worker_name="asr_worker"):
    """
    Configures the ASR worker logger.
    Args:
        worker_name: The name of the worker (e.g., 'sensevoice', 'whisper'). 
                     Used for the log filename.
    """
    logger = logging.getLogger(f"worker.{worker_name}")
    logger.setLevel(logging.INFO)
    
    if logger.handlers:
        return logger

    # --- Formatters ---
    console_fmt_str = '%(asctime)s [%(levelname)s] %(message)s'
    console_formatter = ConsoleFormatter(console_fmt_str, datefmt='%H:%M:%S')
    
    json_formatter = JSONFormatter()

    # --- Handlers ---
    
    # 1. Console (Standard Output) - For Tray App
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    
    # 2. File: Worker Log (Combined Info/Error)
    # e.g., logs/sensevoice.log
    log_file = os.path.join(LOG_DIR, f"{worker_name}.log")
    
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8', delay=True
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(json_formatter)
    
    # Attach Handlers
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    
    logger.propagate = False
    
    return logger
