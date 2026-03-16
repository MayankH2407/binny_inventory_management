#!/bin/bash
set -e

echo "=== Binny Inventory - Production Deploy ==="

# Check .env exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Copy .env.production.example and configure."
  exit 1
fi

# Load env
export $(grep -v '^#' .env.production | xargs)

echo "1. Building production images..."
docker compose -f docker-compose.prod.yml build

echo "2. Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "3. Waiting for database..."
sleep 10

echo "4. Running migrations..."
docker compose -f docker-compose.prod.yml exec backend node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => { console.log('DB connected'); pool.end(); }).catch(e => { console.error(e); process.exit(1); });
"

echo "5. Checking health..."
sleep 5
curl -f http://localhost:${NGINX_PORT:-80}/api/v1/health || echo "Backend health check pending..."

echo ""
echo "=== Deploy complete ==="
echo "Frontend: http://localhost:${NGINX_PORT:-80}"
echo "API:      http://localhost:${NGINX_PORT:-80}/api/v1"
