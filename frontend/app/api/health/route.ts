import { NextResponse } from 'next/server'

export async function GET() {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      frontend: 'healthy'
    }
  }

  return NextResponse.json(healthStatus)
} 