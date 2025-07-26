# Multi-stage build for both frontend and backend
FROM node:18-alpine AS frontend-builder

# Set working directory for frontend
WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy frontend source code and environment file
COPY frontend/ .
COPY .env ./frontend/.env

# Build the frontend application
RUN npm run build

# Python backend stage - use slim for better compatibility
FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies and clean up in one layer
RUN apt-get update && apt-get install -y \
    curl \
    nodejs \
    npm \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install Python dependencies and clean up
RUN uv sync --frozen && \
    uv pip install uvicorn && \
    rm -rf /root/.cache/pip /root/.cache/uv

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
COPY --from=frontend-builder /app/frontend/jsconfig.json ./frontend/jsconfig.json
COPY --from=frontend-builder /app/frontend/next-env.d.ts ./frontend/next-env.d.ts
COPY --from=frontend-builder /app/frontend/lib ./frontend/lib

# Install frontend runtime dependencies and clean up
WORKDIR /app/frontend
RUN npm ci --only=production && \
    npm cache clean --force

# Copy startup script and environment file
WORKDIR /app
COPY start.sh ./
COPY .env ./
RUN chmod +x start.sh

# Create uploads directory
RUN mkdir -p uploads

# Expose ports (Railway will use $PORT)
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