#!/bin/bash

# Start the MCP server in the background
echo "Starting MCP server..."
uv run python -m src.cramwell.server &
MCP_PID=$!

# Wait for MCP server to be ready
echo "Waiting for MCP server to be ready..."
sleep 10

# Start the API server in the background
echo "Starting API server..."
uv run uvicorn src.cramwell.api_server:app --host 0.0.0.0 --port ${API_PORT:-8001} &
API_PID=$!

# Wait for API server to be ready
echo "Waiting for API server to be ready..."
sleep 5

# Wait for all processes
wait $MCP_PID $API_PID 