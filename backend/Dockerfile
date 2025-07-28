# Backend Dockerfile for API and MCP servers
FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies and clean up in one layer
RUN apt-get update && apt-get install -y \
    curl \
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
COPY prompts/ ./prompts/
COPY lib/ ./lib/
COPY tools/ ./tools/
COPY tests/ ./tests/

# Create uploads directory
RUN mkdir -p uploads

# Copy startup scripts
COPY start.sh ./
COPY start-render.sh ./
RUN chmod +x start.sh start-render.sh

# Expose ports (API server on 8001, MCP server on 8000)
EXPOSE 8000 8001

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Health check for API server
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Default command (use start-render.sh for Render deployment)
CMD ["./start-render.sh"] 