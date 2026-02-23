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

# Make sure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Import config parser locally if possible, to know which engine is configured
try:
    from config import get_config
    cfg = get_config()
    ENGINE_NAME = cfg.get("engine", "unknown")
    PORT = cfg.get("port", 8001)
except ImportError:
    ENGINE_NAME = os.environ.get("ASR_ENGINE", "sensevoice")
    PORT = int(os.environ.get("PORT", "8001"))

# --- Config ---
CONFIG_FILE = "tray_config.json"
DEFAULT_CONFIG = {
    "auto_start": False,
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg_local = json.load(f)
                for k, v in DEFAULT_CONFIG.items():
                    if k not in cfg_local:
                        cfg_local[k] = v
                return cfg_local
        except:
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(cfg_local):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg_local, f, indent=4)

config = load_config()

# --- Logging Infrastructure ---
log_queue = queue.Queue()

def log_message(msg):
    timestamp = time.strftime("%H:%M:%S")
    formatted = f"[{timestamp}] {msg}\n"
    log_queue.put(formatted)
    print(formatted, end="")

# --- Worker Manager ---
class ASRWorkerManager:
    def __init__(self):
        self.process = None
        self.stop_event = threading.Event()

    def start(self):
        if self.process and self.process.poll() is None:
            log_message("⚠️ ASR Worker is already running.")
            return

        log_message(f"🚀 Starting ASR Worker ({ENGINE_NAME}) on port {PORT}...")
        
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        
        script_path = "main.py"
        
        try:
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
            
            self.stop_event.clear()
            t = threading.Thread(target=self._monitor_output, daemon=True)
            t.start()
            
            log_message(f"✅ ASR Worker started (PID: {self.process.pid})")
            
        except Exception as e:
            log_message(f"❌ Failed to start ASR Worker: {e}")

    def stop(self):
        if self.process:
            log_message("🛑 Stopping ASR Worker...")
            self.stop_event.set()
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            log_message("⏹️ ASR Worker stopped.")

    def is_running(self):
        return self.process is not None and self.process.poll() is None

    def _monitor_output(self):
        if not self.process or not self.process.stdout:
            return
            
        for line in iter(self.process.stdout.readline, ''):
            if self.stop_event.is_set():
                break
            if line:
                log_message(line.strip())
        
        self.process.stdout.close()

worker = ASRWorkerManager()

# --- GUI Logic (Log Window) ---
window = None
text_area = None

def create_log_window():
    global window, text_area
    window = tk.Tk()
    window.title(f"ASR Worker Logs ({ENGINE_NAME})")
    window.geometry("800x500")
    window.protocol("WM_DELETE_WINDOW", hide_log_window)
    
    style = ttk.Style()
    style.theme_use('clam')
    
    frame = ttk.Frame(window)
    frame.pack(expand=True, fill='both', padx=5, pady=5)
    
    text_area = ScrolledText(frame, state='disabled', bg='#1e1e1e', fg='#d4d4d4', font=('Consolas', 10))
    text_area.pack(expand=True, fill='both')
        
    start_log_polling()
    window.withdraw() 
    window.mainloop()

def start_log_polling():
    poll_logs()

def poll_logs():
    if window and text_area:
        if not log_queue.empty():
            text_area.configure(state='normal')
            while not log_queue.empty():
                msg = log_queue.get()
                text_area.insert(tk.END, msg)
            text_area.see(tk.END)
            text_area.configure(state='disabled')
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
    # Try file in parent dir or current dir
    for p in ["icon.png", "icon.ico", "../icon.png", "../icon.ico", "../doc/assets/icon.png", "../doc/assets/icon.ico"]:
        if os.path.exists(p):
            try:
                return Image.open(p)
            except:
                pass
    
    # Generate backup icon
    img = Image.new('RGB', (64, 64), "#0f172a")
    d = ImageDraw.Draw(img)
    d.rectangle((16,16,48,48), fill="#10b981") # Greenish square for worker
    return img

def action_toggle_worker(icon, item):
    if worker.is_running():
        worker.stop()
    else:
        worker.start()

def save_app_state():
    config["auto_start"] = worker.is_running()
    save_config(config)

def action_restart(icon, item):
    log_message("🔄 Restarting worker tray...")
    save_app_state()
    icon.stop()
    if worker.is_running():
        worker.stop()
    python = sys.executable
    os.execl(python, python, *sys.argv)

def action_show_logs(icon, item):
    if window:
        window.after(0, show_log_window)

def action_exit(icon, item):
    log_message("👋 Exiting ASR Worker tray...")
    save_app_state()
    icon.stop()
    if worker.is_running():
        worker.stop()
    os._exit(0)

def update_menu(icon):
    status_text = "Stop Worker" if worker.is_running() else "Start Worker"
    
    icon.menu = pystray.Menu(
        item(f'ASR Engine: {ENGINE_NAME} (Port: {PORT})', lambda icon, item: None, enabled=False),
        pystray.Menu.SEPARATOR,
        item(status_text, action_toggle_worker, default=True),
        item('Show Logs', action_show_logs),
        pystray.Menu.SEPARATOR,
        item('Restart Tray', action_restart),
        item('Exit', action_exit)
    )

def tray_thread_func():
    icon_name = "DiTing ASR Worker"
    icon = pystray.Icon(icon_name, get_icon_image(), f"{icon_name}\n{ENGINE_NAME}")
    
    # Initial menu setup
    icon.menu = pystray.Menu(
        item(f'ASR Engine: {ENGINE_NAME}', lambda i, it: None, enabled=False),
        item('Start Worker', action_toggle_worker),
        item('Show Logs', action_show_logs),
        item('Exit', action_exit)
    )
    
    def setup(icon):
        icon.visible = True
        while icon.visible:
            update_menu(icon)
            time.sleep(1)
            
    icon.run(setup)

# --- Entry Point ---
if __name__ == "__main__":
    print("🚀 ASR Worker Tray Starting...")
    
    if config.get("auto_start"):
        worker.start()
        
    t = threading.Thread(target=tray_thread_func, daemon=True)
    t.start()
    
    create_log_window()
