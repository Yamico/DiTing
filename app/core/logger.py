import logging
import os
import sys
import json
import contextvars
from logging.handlers import RotatingFileHandler
from datetime import datetime

# --- Context for Trace ID ---
# This will be set by middleware in server.py
trace_id_ctx = contextvars.ContextVar("trace_id", default=None)

# --- Configuration ---
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# File Paths
LOG_FILE_INFO = os.path.join(LOG_DIR, "info.log.json")   # JSON, Info+
LOG_FILE_ERROR = os.path.join(LOG_DIR, "error.log.json") # JSON, Error+
LOG_FILE_ACCESS = os.path.join(LOG_DIR, "access.log.json") # JSON, Access Logs

class JSONFormatter(logging.Formatter):
    """
    Format logs as JSON lines.
    Includes: timestamp, level, name, message, trace_id, and any extra fields.
    """
    def format(self, record):
        log_record = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "trace_id": trace_id_ctx.get(),
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
    Adds [TraceID] if present.
    """
    def format(self, record):
        tid = trace_id_ctx.get()
        prefix = f"[{tid}] " if tid else ""
        
        # Standard format: YYYY-MM-DD HH:MM:SS [LEVEL] Name: [TraceID] Message
        # Using existing format style from original code but inserting trace_id
        msg = super().format(record)
        return msg.replace(f"{record.levelname}] {record.name}: ", f"{record.levelname}] {record.name}: {prefix}")

def setup_logger(name="diting"):
    """
    Configures the main application logger.
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    if logger.handlers:
        return logger

    # --- Formatters ---
    # Console: Human Readable
    console_fmt_str = '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    console_formatter = ConsoleFormatter(console_fmt_str, datefmt='%Y-%m-%d %H:%M:%S')
    
    # File: JSON
    json_formatter = JSONFormatter()

    # --- Handlers ---
    
    # 1. Console (Standard Output) - For Tray App & Dev
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    
    # 2. File: Info (All business logs)
    info_handler = RotatingFileHandler(
        LOG_FILE_INFO, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8', delay=True
    )
    info_handler.setLevel(logging.INFO)
    info_handler.setFormatter(json_formatter)
    
    # 3. File: Error (Only errors)
    error_handler = RotatingFileHandler(
        LOG_FILE_ERROR, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8', delay=True
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(json_formatter)

    # Attach Handlers
    logger.addHandler(console_handler)
    logger.addHandler(info_handler)
    logger.addHandler(error_handler)
    
    logger.propagate = False
    
    return logger

def setup_access_logger():
    """
    Configures Uvicorn access logger to output to a specific JSON file.
    """
    # We want uvicorn.access to go to access.log (JSON) AND Console (Text)
    # But uvicorn default config might conflict. 
    # Best way: Attach our handlers to 'uvicorn.access' and propagate=False?
    # Or just let Uvicorn handle console, we handle file.
    
    access_logger = logging.getLogger("uvicorn.access")
    
    # Check if we already configured it
    # (Simple check: implicit via handlers count, or explicit check like before)
    if any(isinstance(h, RotatingFileHandler) and "access.log" in h.baseFilename for h in access_logger.handlers):
        return

    json_formatter = JSONFormatter()
    
    access_handler = RotatingFileHandler(
        LOG_FILE_ACCESS, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8', delay=True
    )
    access_handler.setLevel(logging.INFO)
    access_handler.setFormatter(json_formatter)
    
    access_logger.addHandler(access_handler)
    
    # We generally want to keep Uvicorn's default console logging active.
    # So we don't set propagate=False unless we replace the console handler too.
    # Uvicorn usually adds a StreamHandler.
    
    # Also link generic uvicorn errors to our main error log
    uvicorn_error = logging.getLogger("uvicorn.error")
    # Add our error handler to it
    # Re-create error handler to avoid double-add issues or just grab references? 
    # Let's clean create one.
    err_handler = RotatingFileHandler(
        LOG_FILE_ERROR, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8', delay=True
    )
    err_handler.setLevel(logging.ERROR)
    err_handler.setFormatter(json_formatter)
    
    # Check duplicate
    if not any(isinstance(h, RotatingFileHandler) and "error.log" in h.baseFilename for h in uvicorn_error.handlers):
        uvicorn_error.addHandler(err_handler)

# Initial Setup
logger = setup_logger()

# Export context var for middleware
__all__ = ["logger", "setup_logger", "setup_access_logger", "trace_id_ctx"]
