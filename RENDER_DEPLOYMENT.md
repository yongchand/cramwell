# Render Deployment Guide

This guide explains how to deploy the separated frontend and backend services on Render.

## Backend Deployment (Web Service)

### 1. Create a new Web Service
- Go to your Render dashboard
- Click "New" → "Web Service"
- Connect your GitHub repository

### 2. Configure the Backend Service
- **Name**: `cramwell-backend` (or your preferred name)
- **Root Directory**: `backend`
- **Runtime**: `Docker`
- **Dockerfile Path**: `Dockerfile` (should be auto-detected)
- **Port**: `8001`

### 3. Environment Variables
Set the following environment variables in Render:

```
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
API_PORT=8001
MCP_PORT=8000
```

### 4. Build Command
The build command will be automatically detected from the Dockerfile.

### 5. Start Command
The start command will be automatically detected from the Dockerfile.

## Frontend Deployment (Static Site)

### 1. Create a new Static Site
- Go to your Render dashboard
- Click "New" → "Static Site"
- Connect your GitHub repository

### 2. Configure the Frontend Service
- **Name**: `cramwell-frontend` (or your preferred name)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Publish Directory**: `out`

### 3. Environment Variables
Set the following environment variables in Render:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=https://cramwell-backend.onrender.com
```

**Important**: The API URL is set to the production backend service.

## Alternative Frontend Deployment (Web Service)

If you prefer to deploy the frontend as a Web Service instead of a Static Site:

### 1. Create a new Web Service
- Go to your Render dashboard
- Click "New" → "Web Service"
- Connect your GitHub repository

### 2. Configure the Frontend Service
- **Name**: `cramwell-frontend`
- **Root Directory**: `frontend`
- **Runtime**: `Node`
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Port**: `3000`

### 3. Environment Variables
Same as above for Static Site deployment.

## Health Checks

Both services include health check endpoints:

- **Backend**: `https://cramwell-backend.onrender.com/health`
- **Frontend**: `https://cramwell.vercel.app/health`

## CORS Configuration

The backend API server is configured to accept requests from:
- `https://cramwell.vercel.app` (production frontend)
- `http://localhost:3000` (development frontend)
- `https://cramwell-backend.onrender.com` (production backend)

## Troubleshooting

### Backend Issues
1. Check the logs in Render dashboard
2. Verify all environment variables are set correctly
3. Ensure the database schema is properly set up
4. Check that the MCP server is starting correctly

### Frontend Issues
1. Check the build logs in Render dashboard
2. Verify the `NEXT_PUBLIC_API_URL` points to the correct backend URL
3. Ensure all environment variables are set correctly
4. Check that the static export is working properly

### Common Issues
1. **CORS errors**: Make sure the backend allows requests from the frontend domain
2. **API connection errors**: Verify the `NEXT_PUBLIC_API_URL` is correct
3. **Build failures**: Check that all dependencies are properly specified
4. **Environment variables**: Ensure all required variables are set in Render 