#!/bin/bash

set -e

echo "🚀 Starting YZInvest AI Deployment on Ubuntu ARM..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    sudo apt install -y docker.io
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker $USER
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📋 Installing Docker Compose..."
    sudo apt install -y docker-compose
fi

# Create necessary directories
echo "📁 Creating data directories..."
sudo mkdir -p /root/yzinvest-ai-database
sudo mkdir -p ./data
sudo chmod -R 755 ./data

# Build and start containers
echo "🔨 Building and starting containers..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

# Initialize database (run migrations)
echo "🗃️ Initializing database..."
docker-compose exec backend python -c "
from app.database import init_db
init_db()
print('Database initialized successfully')
"

# Sync stock data
echo "📊 Syncing initial stock data..."
docker-compose exec backend python -c "
import requests
import time
response = requests.post('http://localhost:8080/api/admin/sync/stocks?X-Session-Token=admin-demo-token')
print('Stock sync response:', response.status_code, response.text)
"

echo "✅ Deployment completed successfully!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8080"
echo "📚 API Documentation: http://localhost:8080/docs"

# Display helpful commands
echo ""
echo "📋 Useful Commands:"
echo "  docker-compose logs -f backend    # View backend logs"
echo "  docker-compose logs -f frontend   # View frontend logs"
echo "  docker-compose restart backend    # Restart backend"
echo "  docker-compose down               # Stop all services"
echo "  docker-compose up -d              # Start all services"