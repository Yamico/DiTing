import os
import sys
import threading
import time
import json
import webbrowser
import queue
import subprocess
import tkinter as tk
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item
import uvicorn
import logging
import signal

# Resolve project root (parent of scripts/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

# Fix sys.argv[0] to absolute path (needed for os.execl restart)
sys.argv[0] = os.path.abspath(__file__)

# --- Config ---
CONFIG_FILE = os.path.join(PROJECT_ROOT, "scripts", "launcher_config.json")
DEFAULT_CONFIG = {
    "auto_start_sensevoice": False,
    "auto_start_whisper": False,
    "auto_start_qwen3asr": False,
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
                for k, v in DEFAULT_CONFIG.items():
                    if k not in cfg:
                        cfg[k] = v
                return cfg
        except:
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=4)

config = load_config()

# --- Logging Infrastructure ---
# We will use queues to pass logs from threads/processes to the GUI
log_queues = {
    "system": queue.Queue(),
    "main": queue.Queue(),
    "sensevoice": queue.Queue(),
    "whisper": queue.Queue(),
    "qwen3asr": queue.Queue()
}

def log_message(source, msg):
    timestamp = time.strftime("%H:%M:%S")
    formatted = f"[{timestamp}] {msg}\n"
    if source in log_queues:
        log_queues[source].put(formatted)
    # Also log to system for overview if critical? (Optional)

class UvicornLogHandler(logging.Handler):
    """redirect uvicorn logs to our queue"""
    def emit(self, record):
        try:
            msg = self.format(record)
            log_message("main", msg)
        except Exception:
            self.handleError(record)

# --- Worker Manager ---
class WorkerManager:
    def __init__(self, name, engine_type, port, log_source):
        self.name = name
        self.engine_type = engine_type
        self.port = port
        self.log_source = log_source
        self.process = None
        self.stop_event = threading.Event()

    def start(self):
        if self.process and self.process.poll() is None:
            log_message("system", f"⚠️ {self.name} is already running.")
            return

        log_message("system", f"🚀 Starting {self.name} on port {self.port}...")
        
        env = os.environ.copy()
        env["ASR_ENGINE"] = self.engine_type
        env["PORT"] = str(self.port)
        env["PYTHONIOENCODING"] = "utf-8"
        
        # Assuming run from root
        script_path = os.path.join("asr_worker", "main.py")
        
        try:
            # Use same python executable
            cmd = [sys.executable, script_path]
            self.process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding='utf-8', 
                errors='replace'
            )
            
            # Start thread to read output
            self.stop_event.clear()
            t = threading.Thread(target=self._monitor_output, daemon=True)
            t.start()
            
            log_message("system", f"✅ {self.name} started (PID: {self.process.pid})")
            
        except Exception as e:
            log_message("system", f"❌ Failed to start {self.name}: {e}")

    def stop(self):
        if self.process:
            log_message("system", f"🛑 Stopping {self.name}...")
            self.stop_event.set()
            # Try terminate first
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            log_message("system", f"⏹️ {self.name} stopped.")

    def is_running(self):
        return self.process is not None and self.process.poll() is None

    def _monitor_output(self):
        """Read stdout/stderr from subprocess and push to log queue"""
        if not self.process or not self.process.stdout:
            return
            
        for line in iter(self.process.stdout.readline, ''):
            if self.stop_event.is_set():
                break
            if line:
                log_message(self.log_source, line.strip())
        
        self.process.stdout.close()

# Initialize Workers
# SenseVoice on 8001, Whisper on 8002, Qwen3-ASR on 8003
sensevoice_worker = WorkerManager("SenseVoice Worker", "sensevoice", 8001, "sensevoice")
whisper_worker = WorkerManager("Whisper Worker", "whisper", 8002, "whisper")
qwen3asr_worker = WorkerManager("Qwen3-ASR Worker", "qwen3asr", 8003, "qwen3asr")

# --- Main Server Logic ---
server_thread = None
main_server_instance = None # To hold Uvicorn server object
stop_server_event = threading.Event()

def run_server():
    """Run Uvicorn Server in a thread"""
    log_message("system", "🚀 Starting Main Server on port 5023...")
    
    # Configure Logging
    handler = UvicornLogHandler()
    formatter = logging.Formatter("%(levelname)s: %(message)s")
    handler.setFormatter(formatter)
    
    # Attach to Uvicorn loggers
    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access", "diting"]:
        l = logging.getLogger(logger_name)
        l.handlers = [handler]
        l.setLevel(logging.INFO)
        l.propagate = False

    try:
        # Import here to ensure logging setup applies
        # Using sys.path hack if needed, but we are in root
        config = uvicorn.Config(
            "app.server:app", 
            host="0.0.0.0", 
            port=5023, 
            log_config=None, # Disable default config to use ours
            reload=False
        )
        global main_server_instance
        main_server_instance = uvicorn.Server(config)
        main_server_instance.run()
    except Exception as e:
        log_message("main", f"Server Crash: {e}")
        log_message("system", f"❌ Main Server crashed: {e}")

def start_main_server():
    global server_thread
    if server_thread and server_thread.is_alive():
        log_message("system", "⚠️ Main Server is already running.")
        return
        
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

def stop_main_server():
    global main_server_instance, server_thread
    if main_server_instance:
        log_message("system", "🛑 Stopping Main Server...")
        main_server_instance.should_exit = True
        # Wait for thread to finish
        if server_thread:
            server_thread.join(timeout=5)
        log_message("system", "⏹️ Main Server stopped.")
        main_server_instance = None
        server_thread = None

# --- GUI Logic (Log Window) ---
window = None
notebook = None
text_widgets = {}

def create_log_window():
    global window, notebook, text_widgets
    window = tk.Tk()
    window.title("DiTing Manager - Logs")
    window.geometry("900x600")
    window.protocol("WM_DELETE_WINDOW", hide_log_window)
    
    # Style
    style = ttk.Style()
    style.theme_use('clam')
    
    notebook = ttk.Notebook(window)
    notebook.pack(expand=True, fill='both', padx=5, pady=5)
    
    # Create tabs
    tabs = ["system", "main", "sensevoice", "whisper", "qwen3asr"]
    titles = ["System", "Main Server", "SenseVoice", "Whisper", "Qwen3-ASR"]
    
    for key, title in zip(tabs, titles):
        frame = ttk.Frame(notebook)
        notebook.add(frame, text=title)
        
        text_area = ScrolledText(frame, state='disabled', bg='#1e1e1e', fg='#d4d4d4', font=('Consolas', 10))
        text_area.pack(expand=True, fill='both')
        text_widgets[key] = text_area
        
    start_log_polling()
    window.withdraw() 
    window.mainloop()

def start_log_polling():
    poll_logs()

def poll_logs():
    if window:
        for key, queue_obj in log_queues.items():
            widget = text_widgets.get(key)
            if widget and not queue_obj.empty():
                widget.configure(state='normal')
                while not queue_obj.empty():
                    msg = queue_obj.get()
                    widget.insert(tk.END, msg)
                widget.see(tk.END)
                widget.configure(state='disabled')
        window.after(100, poll_logs)

def show_log_window():
    if window:
        window.deiconify()
        window.lift()

def hide_log_window():
    if window:
        window.withdraw()

# --- Tray Logic ---
def get_icon_image():
    # Try file
    for p in ["icon.png", "icon.ico", "doc/assets/icon.png", "doc/assets/icon.ico"]:
        if os.path.exists(p):
            return Image.open(p)
    
    # Generate
    img = Image.new('RGB', (64, 64), "#0f172a")
    d = ImageDraw.Draw(img)
    d.rectangle((16,16,48,48), fill="#38bdf8")
    return img

def action_open_dashboard(icon, item):
    webbrowser.open("http://127.0.0.1:5023/app")

def action_toggle_sensevoice(icon, item):
    if sensevoice_worker.is_running():
        sensevoice_worker.stop()
    else:
        sensevoice_worker.start()

def action_toggle_whisper(icon, item):
    if whisper_worker.is_running():
        whisper_worker.stop()
    else:
        whisper_worker.start()

def action_toggle_qwen3asr(icon, item):
    if qwen3asr_worker.is_running():
        qwen3asr_worker.stop()
    else:
        qwen3asr_worker.start()

def save_app_state():
    """Save execution state to config for restoration on restart"""
    config["auto_start_sensevoice"] = sensevoice_worker.is_running()
    config["auto_start_whisper"] = whisper_worker.is_running()
    config["auto_start_qwen3asr"] = qwen3asr_worker.is_running()
    save_config(config)

def stop_all_workers():
    """Stop all workers in parallel"""
    threads = []
    for worker in [sensevoice_worker, whisper_worker, qwen3asr_worker]:
        if worker.is_running():
            t = threading.Thread(target=worker.stop)
            t.start()
            threads.append(t)
        
    for t in threads:
        t.join()

def action_restart(icon, item):
    """Restart the application"""
    log_message("system", "🔄 Restarting application...")
    
    # Save state
    save_app_state()
    
    # Stop tray icon
    icon.stop()
    
    # Do not close window explicitly, os.execl will replace process
    # if window:
    #    window.after(0, window.quit) 
    
    # Stop workers in parallel
    stop_all_workers()
    
    # Restart process
    python = sys.executable
    os.execl(python, python, *sys.argv)


def action_restart_web(icon, item):
    """Restart only the Web Server (Uvicorn)"""
    log_message("system", "🔄 Restarting Web Server...")
    
    # Run in a separate thread to avoid blocking UI/Tray
    def _restart():
        stop_main_server()
        time.sleep(1)
        start_main_server()
        
    threading.Thread(target=_restart, daemon=True).start()


        
def action_show_logs(icon, item):
    # We need to signal the Tkinter thread to show window
    # Pystray runs in its own thread usually if run is blocking? 
    # Actually we run pystray in a thread.
    # Tkinter is in main thread.
    # We can use window.after_idle or just call deiconify? 
    # Tkinter is not thread-safe, strict separation is better.
    # But often deiconify works. Let's try invoke via after.
    if window:
        window.after(0, show_log_window)

def action_exit(icon, item):
    log_message("system", "👋 Exiting application...")
    
    # Save state
    save_app_state()

    icon.stop()
    # Do not close window explicitly, os._exit will kill process
    # if window:
    #    window.after(0, window.quit)
    
    # Stop all processes in parallel
    stop_all_workers()
    
    # Force exit to ensure no hanging threads
    os._exit(0)



def update_menu(icon):
    # Dynamic menu update
    sv_text = "Stop SenseVoice (8001)" if sensevoice_worker.is_running() else "Start SenseVoice (8001)"
    wh_text = "Stop Whisper (8002)" if whisper_worker.is_running() else "Start Whisper (8002)"
    qa_text = "Stop Qwen3-ASR (8003)" if qwen3asr_worker.is_running() else "Start Qwen3-ASR (8003)"
    
    icon.menu = pystray.Menu(
        item('Open Dashboard (React)', action_open_dashboard, default=True),
        pystray.Menu.SEPARATOR,
        item(sv_text, action_toggle_sensevoice),
        item(wh_text, action_toggle_whisper),
        item(qa_text, action_toggle_qwen3asr),
        pystray.Menu.SEPARATOR,
        item('Show Logs', action_show_logs),
        item('Restart Web Server', action_restart_web),
        item('Restart Service (Full)', action_restart),
        item('Exit', action_exit)
    )


def tray_thread_func():
    icon = pystray.Icon("DiTing", get_icon_image(), "谛听 DiTing")
    icon.menu = pystray.Menu(
        item('Open Dashboard (React)', action_open_dashboard, default=True),
        pystray.Menu.SEPARATOR,
        item("Start SenseVoice", action_toggle_sensevoice),
        item("Start Whisper", action_toggle_whisper),
        item("Start Qwen3-ASR", action_toggle_qwen3asr),
        pystray.Menu.SEPARATOR,
        item('Show Logs', action_show_logs),
        item('Restart Web Server', action_restart_web),
        item('Restart Service (Full)', action_restart),
        item('Exit', action_exit)
    )

    
    # Updater loop
    def setup(icon):
        icon.visible = True
        while icon.visible:
            update_menu(icon)
            time.sleep(1)
            
    icon.run(setup)

# --- Entry Point ---
if __name__ == "__main__":
    print("🚀 Launcher Starting...")
    
    # 1. Start Main Server
    start_main_server()
    
    # 2. Auto-start workers if configured (Optional, default off for now to save resource)
    if config.get("auto_start_sensevoice"):
        sensevoice_worker.start()
    if config.get("auto_start_whisper"):
        whisper_worker.start()
    if config.get("auto_start_qwen3asr"):
        qwen3asr_worker.start()
        
    # 3. Start Tray in background thread
    t = threading.Thread(target=tray_thread_func, daemon=True)
    t.start()
    
    # 4. Start GUI (Main Thread)
    create_log_window()
