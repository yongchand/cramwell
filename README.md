# Cramwell

A knowledge management system with AI-powered chat and document processing capabilities.

## Architecture

The application is now split into two separate services:

### Frontend (Static Website)
- **Location**: `frontend/`
- **Deployment**: Static website on Render
- **Technology**: Next.js with static export
- **Port**: 3000 (development), 80 (production)

### Backend (Web Service)
- **Location**: `backend/`
- **Deployment**: Web service on Render
- **Technology**: Python FastAPI + MCP Server
- **Ports**: 
  - 8001 (API Server - exposed)
  - 8000 (MCP Server - internal)

## Development

### Running Backend Only
```bash
docker-compose -f docker-compose.backend.yml up --build
```

### Running Frontend Only
```bash
docker-compose -f docker-compose.frontend.yml up --build
```

### Running Both Services (Development)
```bash
# Backend
docker-compose -f docker-compose.backend.yml up --build -d

# Frontend (in separate terminal)
docker-compose -f docker-compose.frontend.yml up --build
```

## Environment Variables

### Backend
- `OPENAI_API_KEY`: OpenAI API key
- `PINECONE_API_KEY`: Pinecone API key
- `SUPABASE_URL`: Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `API_PORT`: API server port (default: 8001)
- `MCP_PORT`: MCP server port (default: 8000)

### Frontend
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`: Supabase anon key
- `NEXT_PUBLIC_API_URL`: Backend API URL

## Deployment

### Backend Deployment (Render Web Service)
1. Set the root directory to `backend/`
2. Use the Dockerfile in the backend directory
3. Set environment variables
4. Expose port 8001

### Frontend Deployment (Render Static Site)
1. Set the root directory to `frontend/`
2. Build Command: `npm run build`
3. Publish Directory: `out`
4. Set environment variables
5. Render will automatically serve the static site

## API Endpoints

The backend exposes the following main endpoints:
- `GET /health` - Health check
- `GET /notebooks/` - List notebooks
- `POST /notebooks/` - Create notebook
- `GET /notebooks/{id}` - Get notebook
- `PUT /notebooks/{id}` - Update notebook
- `DELETE /notebooks/{id}` - Delete notebook
- `POST /notebooks/{id}/upload/` - Upload document
- `POST /notebooks/{id}/chat/` - Send chat message
- `GET /notebooks/{id}/sources` - Get notebook sources
- `GET /notebooks/{id}/notes` - Get notebook notes
- `POST /search/text` - Text search
- `POST /search/vector` - Vector search

## MCP Server

The MCP (Model Context Protocol) server runs internally on port 8000 and is used by the API server for AI interactions. It's not exposed externally for security reasons.
