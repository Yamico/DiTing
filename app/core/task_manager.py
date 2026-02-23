import threading
import time
import asyncio
from collections import deque
from typing import Dict, Any, Optional
from app.core.logger import logger

class TaskManager:
    _instance = None
    _lock = threading.Lock()
    MAX_HISTORY = 20  # Keep last N finished tasks in memory

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(TaskManager, cls).__new__(cls)
                    cls._instance.tasks = {}
                    cls._instance._finished_ids = deque()  # FIFO queue of finished task IDs
        return cls._instance

    def start_task(self, task_id: int, meta: Dict[str, Any] = None):
        """Register a new task"""
        with self._lock:
            self.tasks[task_id] = {
                "status": "processing",
                "progress": 0,
                "message": "Starting...",
                "cancel_event": threading.Event(),
                "start_time": time.time(),
                "meta": meta or {}
            }
            logger.info(f"✅ TASK STARTED: ID {task_id} | Meta: {meta}")

    def update_progress(self, task_id: int, progress: float, msg: str = None):
        """Update progress (0-100) and message"""
        with self._lock:
            if task_id in self.tasks:
                self.tasks[task_id]["progress"] = progress
                if msg:
                    self.tasks[task_id]["message"] = msg

    def get_task_status(self, task_id: int) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self.tasks.get(task_id, None)

    def cancel_task(self, task_id: int):
        """Signal a task to cancel"""
        with self._lock:
            if task_id in self.tasks:
                logger.warning(f"⚠️ RECEIVED CANCEL SIGNAL for Task {task_id}")
                self.tasks[task_id]["cancel_event"].set()
                self.tasks[task_id]["status"] = "cancelling"
                return True
            logger.warning(f"❌ Failed to cancel task {task_id}: Not found")
            return False

    def is_cancelled(self, task_id: int) -> bool:
        """Check if task is cancelled"""
        with self._lock:
            task = self.tasks.get(task_id)
            if task and task["cancel_event"].is_set():
                return True
        return False

    async def wait_for_cancel(self, task_id: int, interval: float = 0.5):
        """Async wait until cancelled"""
        while True:
            if self.is_cancelled(task_id):
                return
            await asyncio.sleep(interval)

    def check_cancel(self, task_id: int):
        """Raises Exception if cancelled. Used as a check point."""
        if self.is_cancelled(task_id):
            raise TaskCancelledException(f"Task {task_id} cancelled by user")

    def finish_task(self, task_id: int):
        """Mark finished and add to history queue, evicting oldest if over limit."""
        with self._lock:
            if task_id in self.tasks:
                if self.tasks[task_id]["status"] not in ["cancelled", "failed"]:
                    self.tasks[task_id]["status"] = "completed"
                    self.tasks[task_id]["progress"] = 100
                self.tasks[task_id]["end_time"] = time.time()
                
                # Add to finished queue and evict oldest if needed
                self._finished_ids.append(task_id)
                while len(self._finished_ids) > self.MAX_HISTORY:
                    old_id = self._finished_ids.popleft()
                    self.tasks.pop(old_id, None)

    def remove_task(self, task_id: int):
        with self._lock:
            if task_id in self.tasks:
                del self.tasks[task_id]
            # Also remove from finished queue if present
            try:
                self._finished_ids.remove(task_id)
            except ValueError:
                pass

class TaskCancelledException(Exception):
    pass

# Global Instance
task_manager = TaskManager()
