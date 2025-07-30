#!/bin/bash

# Start the API server
echo "Starting API server..."
uv run uvicorn src.cramwell.api_server:app --host 0.0.0.0 --port ${API_PORT:-8001} 