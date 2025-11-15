"""
Task queue system for background kneeboard generation.

This module provides a simple in-memory task queue with a single worker thread
for processing kneeboard generation tasks.
"""

import uuid
import queue
import threading
import time
import logging
import zipfile
import io
from typing import Dict, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field
from flight_plan import FlightPlan
from kneeboard import generate_kneeboard_single_png, generate_kneeboard_zip, FlightPlanData, generate_leg_map

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    """Task status enumeration."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskState:
    """State for a single task."""
    task_id: str
    status: TaskStatus
    flight_plan: FlightPlan
    output: str  # "zip" or leg number
    include_fuel: bool
    created_at: float
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    progress_message: Optional[str] = None
    queue_position: Optional[int] = None
    result: Optional[bytes] = None
    error: Optional[str] = None
    media_type: Optional[str] = None  # "image/png" or "application/zip"


class TaskQueue:
    """In-memory task queue with single worker thread."""
    
    def __init__(self, cleanup_interval: int = 600):  # 10 minutes default
        """
        Initialize the task queue.
        
        Args:
            cleanup_interval: Time in seconds after which completed/failed tasks are cleaned up (default: 600 = 10 minutes)
        """
        self._queue: queue.Queue = queue.Queue()
        self._tasks: Dict[str, TaskState] = {}
        self._lock = threading.Lock()
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._cleanup_interval = cleanup_interval
        self._start_worker()
        self._start_cleanup_thread()
    
    def _start_worker(self):
        """Start the background worker thread."""
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()
        logger.info("Task queue worker thread started")
    
    def _start_cleanup_thread(self):
        """Start the cleanup thread for removing old tasks."""
        cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        cleanup_thread.start()
        logger.info("Task queue cleanup thread started")
    
    def _cleanup_loop(self):
        """Periodically clean up old completed/failed tasks."""
        while not self._stop_event.is_set():
            try:
                time.sleep(60)  # Check every minute
                self._cleanup_old_tasks()
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    def _cleanup_old_tasks(self):
        """Remove tasks older than cleanup_interval."""
        current_time = time.time()
        with self._lock:
            tasks_to_remove = []
            for task_id, task_state in self._tasks.items():
                if task_state.status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
                    if task_state.completed_at and (current_time - task_state.completed_at) > self._cleanup_interval:
                        tasks_to_remove.append(task_id)
            
            for task_id in tasks_to_remove:
                logger.info(f"Cleaning up old task {task_id}")
                del self._tasks[task_id]
    
    def _worker_loop(self):
        """Main worker loop that processes tasks from the queue."""
        logger.info("Worker thread started")
        while not self._stop_event.is_set():
            try:
                # Get task from queue (with timeout to allow checking stop event)
                try:
                    task_id = self._queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                
                # Process the task
                self._process_task(task_id)
                self._queue.task_done()
            except Exception as e:
                logger.error(f"Error in worker loop: {e}", exc_info=True)
    
    def _process_task(self, task_id: str):
        """Process a single task."""
        with self._lock:
            if task_id not in self._tasks:
                logger.warning(f"Task {task_id} not found in task state")
                return
            
            task_state = self._tasks[task_id]
            if task_state.status != TaskStatus.QUEUED:
                logger.warning(f"Task {task_id} is not in QUEUED status, skipping")
                return
            
            # Update status to processing
            task_state.status = TaskStatus.PROCESSING
            task_state.started_at = time.time()
            task_state.progress_message = "Starting generation..."
            task_state.queue_position = None
        
        logger.info(f"Processing task {task_id}: output={task_state.output}, include_fuel={task_state.include_fuel}")
        
        try:
            # Create progress callback
            def progress_callback(message: str):
                with self._lock:
                    if task_id in self._tasks:
                        self._tasks[task_id].progress_message = message
                        logger.debug(f"Task {task_id} progress: {message}")
            
            # Generate kneeboard
            if task_state.output == "zip":
                progress_callback("Generating all leg maps...")
                result = self._generate_zip_with_progress(task_state.flight_plan, progress_callback)
                media_type = "application/zip"
            else:
                leg_index = int(task_state.output) - 1
                progress_callback(f"Generating leg {task_state.output} map...")
                result = generate_kneeboard_single_png(task_state.flight_plan, leg_index)
                media_type = "image/png"
            
            # Update task state with result
            with self._lock:
                if task_id in self._tasks:
                    task_state = self._tasks[task_id]
                    task_state.status = TaskStatus.COMPLETED
                    task_state.completed_at = time.time()
                    task_state.result = result
                    task_state.media_type = media_type
                    task_state.progress_message = "Generation completed"
            
            logger.info(f"Task {task_id} completed successfully")
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Task {task_id} failed: {error_msg}", exc_info=True)
            with self._lock:
                if task_id in self._tasks:
                    task_state = self._tasks[task_id]
                    task_state.status = TaskStatus.FAILED
                    task_state.completed_at = time.time()
                    task_state.error = error_msg
                    task_state.progress_message = f"Error: {error_msg}"
    
    def _generate_zip_with_progress(self, flight_plan: FlightPlan, progress_callback: Callable[[str], None]) -> bytes:
        """Generate ZIP with progress updates."""
        if len(flight_plan.points) < 2:
            raise ValueError("Flight plan must have at least 2 waypoints to generate a leg map")
        
        # Generate all leg maps
        flightPlanData = FlightPlanData(flight_plan)
        total_legs = len(flightPlanData.legData)
        leg_maps = []
        
        for i in range(total_legs):
            progress_callback(f"Generating page {i+1}/{total_legs}")
            leg_map = generate_leg_map(flight_plan, flightPlanData, i)
            leg_maps.append(leg_map)
        
        progress_callback("Creating ZIP file...")
        
        # Create ZIP file
        zip_data = io.BytesIO()
        with zipfile.ZipFile(zip_data, 'w', compression=zipfile.ZIP_STORED) as zipf:
            for i, leg_map in enumerate(leg_maps):
                zipf.writestr(f"leg_{i+1}.png", leg_map)
        
        return zip_data.getvalue()
    
    def submit_task(self, flight_plan: FlightPlan, output: str, include_fuel: bool) -> str:
        """
        Submit a new task to the queue.
        
        Args:
            flight_plan: The flight plan to generate
            output: Output type ("zip" or leg number)
            include_fuel: Whether to include fuel calculations
        
        Returns:
            Task ID
        """
        task_id = str(uuid.uuid4())
        task_state = TaskState(
            task_id=task_id,
            status=TaskStatus.QUEUED,
            flight_plan=flight_plan,
            output=output,
            include_fuel=include_fuel,
            created_at=time.time(),
            progress_message="In queue"
        )
        
        with self._lock:
            self._tasks[task_id] = task_state
            # Calculate queue position
            queue_size = self._queue.qsize()
            task_state.queue_position = queue_size + 1
        
        self._queue.put(task_id)
        logger.info(f"Task {task_id} submitted to queue (position {task_state.queue_position})")
        
        return task_id
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        """
        Get the status of a task.
        
        Args:
            task_id: The task ID
        
        Returns:
            Dictionary with task status, or None if task not found
        """
        with self._lock:
            if task_id not in self._tasks:
                return None
            
            task_state = self._tasks[task_id]
            
            # Update queue position if queued
            queue_position = None
            if task_state.status == TaskStatus.QUEUED:
                # Count tasks in queue before this one
                queue_list = list(self._queue.queue)
                try:
                    queue_position = queue_list.index(task_id) + 1
                except ValueError:
                    queue_position = None
                task_state.queue_position = queue_position
            
            return {
                "task_id": task_state.task_id,
                "status": task_state.status.value,
                "progress_message": task_state.progress_message,
                "queue_position": task_state.queue_position,
                "created_at": task_state.created_at,
                "started_at": task_state.started_at,
                "completed_at": task_state.completed_at,
                "error": task_state.error,
            }
    
    def get_task_result(self, task_id: str) -> Optional[tuple[bytes, str]]:
        """
        Get the result of a completed task.
        
        Args:
            task_id: The task ID
        
        Returns:
            Tuple of (result bytes, media_type) or None if task not found or not completed
        """
        with self._lock:
            if task_id not in self._tasks:
                return None
            
            task_state = self._tasks[task_id]
            if task_state.status != TaskStatus.COMPLETED:
                return None
            
            return (task_state.result, task_state.media_type)
    
    def shutdown(self):
        """Shutdown the task queue and worker thread."""
        logger.info("Shutting down task queue...")
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=5.0)
        logger.info("Task queue shut down")


# Global task queue instance
_task_queue: Optional[TaskQueue] = None


def get_task_queue() -> TaskQueue:
    """Get or create the global task queue instance."""
    global _task_queue
    if _task_queue is None:
        _task_queue = TaskQueue()
    return _task_queue

