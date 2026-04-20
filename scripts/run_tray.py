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
import logging
import copy
import uvicorn

# Resolve project root (parent of scripts/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

# Fix sys.argv[0] to absolute path (needed for os.execl restart)
sys.argv[0] = os.path.abspath(__file__)

# --- Config ---
CONFIG_FILE = os.path.join(PROJECT_ROOT, "scripts", "launcher_config.json")
WORKER_STATE_ROOT = os.path.join(PROJECT_ROOT, "data", "worker_states")
DEFAULT_WORKERS = [
    {
        "id": "worker-8001",
        "name": "Worker 8001",
        "port": 8001,
        "default_engine": "sensevoice",
        "auto_start": False,
    }
]
DEFAULT_CONFIG = {
    "workers": copy.deepcopy(DEFAULT_WORKERS),
}


def _default_config() -> dict:
    return copy.deepcopy(DEFAULT_CONFIG)


def _normalize_worker_configs(cfg: dict) -> dict:
    workers = cfg.get("workers")
    if isinstance(workers, list) and workers:
        normalized = []
        for index, worker in enumerate(workers):
            if not isinstance(worker, dict):
                continue
            port = int(worker.get("port", 8001 + index))
            worker_id = str(worker.get("id") or f"worker-{port}")
            normalized.append({
                "id": worker_id,
                "name": str(worker.get("name") or f"Worker {port}"),
                "port": port,
                "default_engine": str(worker.get("default_engine") or "sensevoice"),
                "auto_start": bool(worker.get("auto_start", False)),
            })
        if normalized:
            cfg["workers"] = normalized
            return cfg

    # Migrate old boolean-based config
    legacy_map = [
        ("auto_start_sensevoice", 8001, "sensevoice", "SenseVoice Worker"),
        ("auto_start_whisper", 8002, "whisper", "Whisper Worker"),
        ("auto_start_qwen3asr", 8003, "qwen3asr", "Qwen3-ASR Worker"),
    ]
    migrated_workers = []
    for key, port, engine, name in legacy_map:
        migrated_workers.append({
            "id": f"worker-{port}",
            "name": name,
            "port": port,
            "default_engine": engine,
            "auto_start": bool(cfg.get(key, False)),
        })
    cfg["workers"] = migrated_workers or copy.deepcopy(DEFAULT_WORKERS)
    return cfg


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            if not isinstance(cfg, dict):
                cfg = _default_config()
        except Exception:
            cfg = _default_config()
    else:
        cfg = _default_config()
    return _normalize_worker_configs(cfg)


def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=4, ensure_ascii=False)


config = load_config()
os.makedirs(WORKER_STATE_ROOT, exist_ok=True)


def _startupinfo():
    if os.name != "nt":
        return None
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return startupinfo

log_queues = {
    "system": queue.Queue(),
    "main": queue.Queue(),
}


def ensure_log_queue(source: str):
    if source not in log_queues:
        log_queues[source] = queue.Queue()


for worker_cfg in config["workers"]:
    ensure_log_queue(worker_cfg["id"])



def log_message(source, msg):
    timestamp = time.strftime("%H:%M:%S")
    formatted = f"[{timestamp}] {msg}\n"
    if source in log_queues:
        log_queues[source].put(formatted)


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
    def __init__(self, worker_id: str, name: str, port: int, default_engine: str):
        self.worker_id = worker_id
        self.name = name
        self.port = port
        self.default_engine = default_engine
        self.log_source = worker_id
        self.process = None
        self.stop_event = threading.Event()
        self.model_state_path = os.path.join(WORKER_STATE_ROOT, worker_id)
        os.makedirs(self.model_state_path, exist_ok=True)

    def start(self):
        if self.process and self.process.poll() is None:
            log_message("system", f"⚠️ {self.name} is already running.")
            return

        log_message("system", f"🚀 Starting {self.name} on port {self.port}...")

        env = os.environ.copy()
        env["ASR_ENGINE"] = self.default_engine
        env["PORT"] = str(self.port)
        env["SERVER_URL"] = "http://127.0.0.1:5023"
        env["MODEL_STATE_PATH"] = self.model_state_path
        env["PYTHONIOENCODING"] = "utf-8"

        script_path = os.path.join("asr_worker", "main.py")
        startupinfo = _startupinfo()

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
                errors='replace',
                startupinfo=startupinfo,
            )

            self.stop_event.clear()
            t = threading.Thread(target=self._monitor_output, daemon=True)
            t.start()

            log_message("system", f"✅ {self.name} started (PID: {self.process.pid}, default_engine={self.default_engine})")
        except Exception as e:
            log_message("system", f"❌ Failed to start {self.name}: {e}")

    def stop(self):
        if self.process:
            log_message("system", f"🛑 Stopping {self.name}...")
            self.stop_event.set()
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
        if not self.process or not self.process.stdout:
            return

        for line in iter(self.process.stdout.readline, ''):
            if self.stop_event.is_set():
                break
            if line:
                log_message(self.log_source, line.strip())

        self.process.stdout.close()


workers = [
    WorkerManager(
        worker_id=worker_cfg["id"],
        name=worker_cfg["name"],
        port=worker_cfg["port"],
        default_engine=worker_cfg["default_engine"],
    )
    for worker_cfg in config["workers"]
]
worker_map = {worker.worker_id: worker for worker in workers}

# --- Main Server Logic ---
server_thread = None
main_server_instance = None


def run_server():
    """Run Uvicorn Server in a thread"""
    log_message("system", "🚀 Starting Main Server on port 5023...")

    handler = UvicornLogHandler()
    formatter = logging.Formatter("%(levelname)s: %(message)s")
    handler.setFormatter(formatter)

    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        l = logging.getLogger(logger_name)
        l.handlers = [handler]
        l.setLevel(logging.INFO)
        l.propagate = False

    diting_logger = logging.getLogger("diting")
    diting_logger.addHandler(handler)
    diting_logger.setLevel(logging.INFO)
    diting_logger.propagate = False

    try:
        uvicorn_config = uvicorn.Config(
            "app.server:app",
            host="0.0.0.0",
            port=5023,
            log_config=None,
            reload=False
        )
        global main_server_instance
        main_server_instance = uvicorn.Server(uvicorn_config)
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

    style = ttk.Style()
    style.theme_use('clam')

    notebook = ttk.Notebook(window)
    notebook.pack(expand=True, fill='both', padx=5, pady=5)

    tabs = [("system", "System"), ("main", "Main Server")]
    tabs.extend((worker.worker_id, worker.name) for worker in workers)

    for key, title in tabs:
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
    for p in ["icon.png", "icon.ico", "doc/assets/icon.png", "doc/assets/icon.ico"]:
        if os.path.exists(p):
            return Image.open(p)

    img = Image.new('RGB', (64, 64), "#0f172a")
    d = ImageDraw.Draw(img)
    d.rectangle((16, 16, 48, 48), fill="#38bdf8")
    return img



def action_open_dashboard(icon, item):
    webbrowser.open("http://127.0.0.1:5023/app")



def make_worker_toggle_action(worker_id: str):
    def _toggle(icon, item):
        worker = worker_map[worker_id]
        if worker.is_running():
            worker.stop()
        else:
            worker.start()
    return _toggle



def save_app_state():
    for worker_cfg in config["workers"]:
        worker = worker_map.get(worker_cfg["id"])
        if worker:
            worker_cfg["auto_start"] = worker.is_running()
    save_config(config)



def stop_all_workers():
    threads = []
    for worker in workers:
        if worker.is_running():
            t = threading.Thread(target=worker.stop)
            t.start()
            threads.append(t)

    for t in threads:
        t.join()



def action_restart(icon, item):
    log_message("system", "🔄 Restarting application...")
    save_app_state()
    icon.stop()
    stop_all_workers()
    python = sys.executable
    os.execl(python, python, *sys.argv)



def action_restart_web(icon, item):
    log_message("system", "🔄 Restarting Web Server...")

    def _restart():
        stop_main_server()
        time.sleep(1)
        start_main_server()

    threading.Thread(target=_restart, daemon=True).start()



def action_show_logs(icon, item):
    if window:
        window.after(0, show_log_window)



def action_exit(icon, item):
    log_message("system", "👋 Exiting application...")
    save_app_state()
    icon.stop()
    stop_all_workers()
    os._exit(0)



def build_worker_menu_items():
    items = []
    for worker in workers:
        label = f"Stop {worker.name} ({worker.port})" if worker.is_running() else f"Start {worker.name} ({worker.port})"
        items.append(item(label, make_worker_toggle_action(worker.worker_id)))
    return items



def update_menu(icon):
    worker_items = build_worker_menu_items()
    icon.menu = pystray.Menu(
        item('Open Dashboard (React)', action_open_dashboard, default=True),
        pystray.Menu.SEPARATOR,
        *worker_items,
        pystray.Menu.SEPARATOR,
        item('Show Logs', action_show_logs),
        item('Restart Web Server', action_restart_web),
        item('Restart Service (Full)', action_restart),
        item('Exit', action_exit)
    )
    icon.update_menu()



def tray_thread_func():
    icon = pystray.Icon("DiTing", get_icon_image(), "谛听 DiTing")
    update_menu(icon)

    def setup(icon):
        icon.visible = True
        while icon.visible:
            update_menu(icon)
            time.sleep(1)

    icon.run(setup)


# --- Entry Point ---
if __name__ == "__main__":
    print("Launcher Starting...")

    start_main_server()

    for worker_cfg in config["workers"]:
        if worker_cfg.get("auto_start"):
            worker_map[worker_cfg["id"]].start()

    t = threading.Thread(target=tray_thread_func, daemon=True)
    t.start()

    create_log_window()
