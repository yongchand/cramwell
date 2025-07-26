# Multi-stage build for both frontend and backend
FROM node:18-alpine AS frontend-builder

# Set working directory for frontend
WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source code
COPY frontend/ .

# Build the frontend application
RUN npm run build

# Python backend stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN uv sync --frozen

# Copy source code
COPY src/ ./src/

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-builder /app/frontend/package-lock.json ./frontend/package-lock.json
COPY --from=frontend-builder /app/frontend/next.config.js ./frontend/next.config.js
COPY --from=frontend-builder /app/frontend/tailwind.config.js ./frontend/tailwind.config.js
COPY --from=frontend-builder /app/frontend/postcss.config.js ./frontend/postcss.config.js
COPY --from=frontend-builder /app/frontend/tsconfig.json ./frontend/tsconfig.json
COPY --from=frontend-builder /app/frontend/next-env.d.ts ./frontend/next-env.d.ts

# Install frontend runtime dependencies
WORKDIR /app/frontend
RUN npm ci --only=production

# Copy startup script
WORKDIR /app
COPY start.sh ./
RUN chmod +x start.sh

# Create uploads directory
RUN mkdir -p uploads

# Expose ports
EXPOSE 8000 8001 3000

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Default command
CMD ["./start.sh"] 