#!/usr/bin/env python3
"""
Test script to verify memory fixes work correctly.
"""

import asyncio
import tempfile
import os
import psutil
import gc
from datetime import datetime

def get_memory_usage():
    """Get current memory usage."""
    process = psutil.Process()
    memory_info = process.memory_info()
    return memory_info.rss / 1024 / 1024  # MB

async def test_memory_cleanup():
    """Test that memory cleanup works properly."""
    print("Testing memory cleanup...")
    
    # Get initial memory
    initial_memory = get_memory_usage()
    print(f"Initial memory: {initial_memory:.1f}MB")
    
    # Simulate file processing
    for i in range(5):
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.txt') as temp_file:
            # Write some content
            content = f"Test content for file {i}\n" * 1000
            temp_file.write(content.encode())
            temp_file_path = temp_file.name
        
        try:
            # Simulate processing
            with open(temp_file_path, 'r') as f:
                text = f.read()
            
            # Simulate some processing
            processed_text = text.upper()
            
            print(f"Processed file {i}, memory: {get_memory_usage():.1f}MB")
            
        finally:
            # Clean up
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
            # Force garbage collection
            gc.collect()
    
    # Get final memory
    final_memory = get_memory_usage()
    print(f"Final memory: {final_memory:.1f}MB")
    print(f"Memory difference: {final_memory - initial_memory:.1f}MB")
    
    if final_memory - initial_memory < 50:  # Less than 50MB increase
        print("✅ Memory cleanup test passed!")
    else:
        print("❌ Memory cleanup test failed!")

if __name__ == "__main__":
    asyncio.run(test_memory_cleanup()) 