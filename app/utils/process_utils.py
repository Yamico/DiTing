import multiprocessing
import asyncio
from app.core.task_manager import task_manager, TaskCancelledException
from app.core.logger import logger

def _worker_wrapper(func, args, kwargs, queue):
    try:
        # Re-configure logger in new process if needed (optional)
        result = func(*args, **kwargs)
        queue.put({"status": "success", "result": result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        queue.put({"status": "error", "error": str(e)})

async def run_cancellable_process(task_id: int, func, *args, **kwargs):
    """
    Run a blocking function in a separate process to allow termination.
    Uses 'spawn' context for compatibility with CUDA/Torch on Windows.
    """
    ctx = multiprocessing.get_context('spawn')
    queue = ctx.Queue()
    
    p = ctx.Process(target=_worker_wrapper, args=(func, args, kwargs, queue))
    p.start()
    
    logger.info(f"🚀 Started subprocess {p.pid} for task {task_id}")
    
    try:
        while p.is_alive():
            if task_manager.is_cancelled(task_id):
                logger.warning(f"🛑 Terminating process {p.pid} for task {task_id}")
                p.terminate()
                p.join(timeout=2)
                if p.is_alive(): 
                    logger.warning(f"💀 Killing process {p.pid}")
                    p.kill()
                raise TaskCancelledException("Process terminated by user")
            
            await asyncio.sleep(0.5)
            
        # Process finished naturally
        p.join() # Ensure cleanup
        
        if not queue.empty():
            res = queue.get()
            if res["status"] == "error":
                raise Exception(res["error"])
            return res["result"]
        else:
            # If queue is empty but process finished, likely an error or crash
            exitcode = p.exitcode
            if exitcode != 0:
                 raise Exception(f"Process crashed with exit code {exitcode}")
            return None # Or raise Exception? separate_vocals returns path or None.
            
    except TaskCancelledException:
        if p.is_alive():
            p.terminate()
            p.join()
        raise
    except Exception as e:
        if p.is_alive():
            p.terminate()
            p.join()
        raise e
