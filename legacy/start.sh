#!/bin/bash

set -e

echo "🚀 Starting YZInvest AI Services..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start services
docker-compose up -d

echo "⏳ Waiting for services to start..."
sleep 20

# Check service status
echo "🔍 Service Status:"
docker-compose ps

echo ""
echo "✅ Services started successfully!"
echo "🌐 Frontend: http://localhost:8080"
echo "🔧 Backend API: http://localhost:8080"
echo "📚 API Docs: http://localhost:8080/docs"