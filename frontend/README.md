# Cramwell Frontend

This is the frontend application for Cramwell, built with Next.js and TypeScript.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## API Server

Make sure the API server is running on `http://localhost:8000`. You can start it with:

```bash
cd ../cramwell
uv run src/cramwell/api_server.py
```

## Features

- Create and manage notebooks
- Upload documents to notebooks
- Chat with documents using AI
- View document sources and summaries

## Development

The frontend is built with:
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Lucide React (icons)
- Axios (HTTP client) 