#!/usr/bin/env python3
"""
Memory monitoring script for Cramwell backend.
Run this to monitor memory usage during file uploads.
"""

import time
import psutil
import gc
import os
import sys

def get_memory_usage():
    """Get current memory usage."""
    process = psutil.Process()
    memory_info = process.memory_info()
    
    return {
        "rss_mb": memory_info.rss / 1024 / 1024,  # Resident Set Size in MB
        "vms_mb": memory_info.vms / 1024 / 1024,  # Virtual Memory Size in MB
        "percent": process.memory_percent(),
        "available_mb": psutil.virtual_memory().available / 1024 / 1024
    }

def monitor_memory(interval=5):
    """Monitor memory usage continuously."""
    
    try:
        while True:
            # Force garbage collection
            gc.collect()
            
            # Get memory info
            mem_info = get_memory_usage()
            
            time.sleep(interval)
            
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    interval = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    monitor_memory(interval) 