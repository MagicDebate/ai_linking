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
export $(cat .env | grep -v '^#' | xargs)

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

# 4. Собираем проект
echo "🔨 Building project..."
npm run build

# 5. Останавливаем старый процесс (если есть)
echo "🛑 Stopping old process..."
pkill -f "node.*dist/index.js" || true

# 6. Запускаем новый процесс
echo "▶️ Starting new process..."
nohup NODE_ENV=production node -r dotenv/config dist/index.js > app.log 2>&1 &

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
