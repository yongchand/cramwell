#!/bin/bash

# Start the API server on port 8001
echo "Starting API server on port 8001..."
uv run uvicorn src.cramwell.api_server:app --host 0.0.0.0 --port 8001 