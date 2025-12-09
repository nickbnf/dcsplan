"""
Centralized logging configuration for the backend.

Supports both text and JSON logging formats based on the LOG_FORMAT environment variable.
- LOG_FORMAT=json: Outputs JSON logs for production (e.g., New Relic ingestion)
- LOG_FORMAT=text or unset: Outputs human-readable text logs for development
"""
import logging
import os
import sys

try:
    from pythonjsonlogger import jsonlogger
except ImportError:
    jsonlogger = None


def setup_logging():
    """
    Configure logging for the application.
    
    Checks the LOG_FORMAT environment variable:
    - 'json': Uses JSON formatter (production)
    - 'text' or unset: Uses text formatter (development)
    """
    # Get log format from environment, default to 'text' for development
    log_format = os.getenv("LOG_FORMAT", "text").lower()
    
    # Get log level from environment, default to INFO
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # Get service name for JSON logs (useful for New Relic)
    service_name = os.getenv("SERVICE_NAME", "dcsplan-backend")
    
    # Remove any existing handlers to avoid duplicates
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    
    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    
    if log_format == "json":
        # JSON formatter for production
        if jsonlogger is None:
            raise ImportError(
                "python-json-logger is required for JSON logging. "
                "Install it with: pip install python-json-logger"
            )
        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            # Add service name to all log entries
            static_fields={"service.name": service_name}
        )
    else:
        # Text formatter for development
        formatter = logging.Formatter(
            fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level, logging.INFO))
    
    # Configure uvicorn loggers to use the same formatter
    uvicorn_loggers = [
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
    ]
    for logger_name in uvicorn_loggers:
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.addHandler(handler)
        uvicorn_logger.setLevel(getattr(logging, log_level, logging.INFO))
        uvicorn_logger.propagate = False
    
    # Prevent duplicate logs from propagating to root logger
    root_logger.propagate = False
