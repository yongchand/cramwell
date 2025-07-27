#!/bin/bash

# Get the port from Render's PORT environment variable, default to 3000
PORT=${PORT:-3000}

# Start the MCP server in the background
echo "Starting MCP server..."
uv run python -m src.cramwell.server &
MCP_PID=$!

# Wait for MCP server to be ready
echo "Waiting for MCP server to be ready..."
sleep 10

# Start the API server in the background on port 8001
echo "Starting API server on port 8001..."
uvicorn src.cramwell.api_server:app --host 0.0.0.0 --port 8001 &
API_PID=$!

# Wait for API server to be ready
echo "Waiting for API server to be ready..."
sleep 5

# Start the frontend on the Render-provided port
echo "Starting frontend on port $PORT..."
cd /app/frontend
PORT=$PORT npm start &
FRONTEND_PID=$!

# Wait for all processes
wait $MCP_PID $API_PID $FRONTEND_PID 