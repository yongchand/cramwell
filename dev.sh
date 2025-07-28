#!/bin/bash

echo "Starting Cramwell development environment..."

# Check if docker-compose files exist
if [ ! -f "docker-compose.backend.yml" ]; then
    echo "Error: docker-compose.backend.yml not found"
    exit 1
fi

if [ ! -f "docker-compose.frontend.yml" ]; then
    echo "Error: docker-compose.frontend.yml not found"
    exit 1
fi

# Start backend
echo "Starting backend service..."
docker-compose -f docker-compose.backend.yml up --build -d

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
sleep 10

# Start frontend
echo "Starting frontend service..."
docker-compose -f docker-compose.frontend.yml up --build

echo "Development environment started!"
echo "Backend API: http://localhost:8001"
echo "Frontend: http://localhost"
echo ""
echo "Press Ctrl+C to stop all services" 