from typing import Optional, Callable

class ProgressHelper:
    """
    Helper to scale progress from a sub-task (0-100) to a slice of the main task (start_pct - end_pct).
    """
    def __init__(self, task_manager, task_id: int, start_pct: float, end_pct: float):
        self.task_manager = task_manager
        self.task_id = task_id
        self.start_pct = start_pct
        self.end_pct = end_pct
        self.span = end_pct - start_pct

    def update(self, current_task_id: int, progress: float, msg: str = None):
        """
        Callback function compatible with downloaders.
        Ignores current_task_id validation if needed, or verifies it matches.
        """
        # Calculate scaled progress
        scaled_progress = self.start_pct + (progress / 100.0 * self.span)
        
        # Ensure we don't exceed end_pct due to floating point or overshoot
        scaled_progress = min(scaled_progress, self.end_pct)
        
        self.task_manager.update_progress(self.task_id, scaled_progress, msg)

    def get_callback(self) -> Callable:
        return self.update
