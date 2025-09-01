#!/bin/bash

set -e

echo "🚀 Starting deployment..."

# Проверяем наличие файла .env
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from example..."
    if [ -f "env.example" ]; then
        cp env.example .env
        echo "✅ .env file created from env.example"
        echo "⚠️  Please edit .env file with your actual values before continuing"
        echo "   Required: DATABASE_URL, JWT_SECRET, SESSION_SECRET"
        exit 1
    else
        echo "❌ env.example file not found"
        exit 1
    fi
fi

# Загружаем переменные из .env
set -a
source .env
set +a

# Проверяем переменные окружения
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL is not set in .env file"
    exit 1
fi

# 1. Забираем последние изменения
echo "📥 Pulling latest changes..."
git pull origin feature/phase1

# 2. Устанавливаем зависимости
echo "📦 Installing dependencies..."
npm cache clean --force
npm install --legacy-peer-deps

# 3. Инициализируем базу данных
echo "🗄️ Initializing database..."
node scripts/init-db.js

# 3.5. Применяем исправления CASCADE
echo "🔧 Applying CASCADE fixes..."
if [ -f "fix-cascade-deletes.sql" ]; then
    if command -v psql >/dev/null 2>&1; then
        echo "📝 Executing fix-cascade-deletes.sql..."
        psql "$DATABASE_URL" -f fix-cascade-deletes.sql
        echo "✅ CASCADE fixes applied successfully"
    else
        echo "⚠️  psql not found, skipping CASCADE fixes"
        echo "   Install PostgreSQL client: sudo apt-get install postgresql-client"
    fi
else
    echo "⚠️  fix-cascade-deletes.sql not found, skipping CASCADE fixes"
fi

# 4. Собираем проект
echo "🔨 Building project..."
npm run build

# 5. Останавливаем старый процесс (если есть)
echo "🛑 Stopping old process..."
pkill -f "node.*dist/index.js" || true

# 6. Запускаем новый процесс
echo "▶️ Starting new process..."
export NODE_ENV=production
nohup node -r dotenv/config dist/index.js > app.log 2>&1 &

# 7. Ждем запуска
echo "⏳ Waiting for server to start..."
sleep 5

# 8. Проверяем статус
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Deployment completed successfully!"
    echo "🌐 Server is running on http://localhost:3000"
else
    echo "❌ Deployment failed - server is not responding"
    echo "📋 Check logs: tail -f app.log"
    exit 1
fi
