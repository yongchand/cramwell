#!/bin/bash

echo "Stopping Cramwell development environment..."

# Stop frontend
echo "Stopping frontend service..."
docker-compose -f docker-compose.frontend.yml down

# Stop backend
echo "Stopping backend service..."
docker-compose -f docker-compose.backend.yml down

echo "All services stopped!" 