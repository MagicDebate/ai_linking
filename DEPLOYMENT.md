# 🚀 Deployment Guide

## Быстрый деплой

### 1. Подготовка сервера

```bash
# Установить PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Установить Redis
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Установить Node.js (если не установлен)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установить pgvector
sudo apt install build-essential postgresql-server-dev-14 git
cd /tmp
git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
sudo systemctl restart postgresql
```

### 2. Настройка базы данных

```bash
# Создать базу данных и пользователя
sudo -u postgres psql
CREATE DATABASE ai_linking;
CREATE USER ai_user WITH PASSWORD 'pass123456';
GRANT ALL PRIVILEGES ON DATABASE ai_linking TO ai_user;
\q
```

### 3. Настройка переменных окружения

Создайте файл `.env`:

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://ai_user:pass123456@localhost:5432/ai_linking
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=your-strong-secret-key-here

# API Keys (опционально)
OPENAI_API_KEY=your_openai_key_here
GOOGLE_AI_API_KEY=your_google_ai_key_here
```

### 4. Автоматический деплой

```bash
# Клонировать проект
git clone https://github.com/MagicDebate/ai_linking.git
cd ai_linking
git checkout feature/phase1

# Запустить автоматический деплой
npm run deploy
```

### 5. Ручной деплой

```bash
# Инициализировать базу данных
npm run db:init

# Собрать проект
npm run build

# Запустить сервер
npm start
```

## Команды для управления

### База данных

```bash
# Инициализировать БД (создать таблицы и тестовые данные)
npm run db:init

# Применить миграции
npm run db:push

# Сгенерировать миграции
npm run db:generate

# Открыть Drizzle Studio
npm run db:studio
```

### Сервер

```bash
# Запуск в режиме разработки
npm run dev

# Сборка проекта
npm run build

# Запуск в продакшене
npm start

# Полный деплой
npm run deploy
```

### Тестирование

```bash
# Тест Phase 1
npm run test:phase1

# Тест очередей
npm run test:queues

# Тест эмбеддингов
npm run test:embeddings
```

## Структура базы данных

### Основные таблицы

- `users` - пользователи системы
- `projects` - проекты пользователей
- `imports` - импорты файлов
- `import_jobs` - задачи обработки импортов
- `pages_raw` - сырые страницы
- `pages_clean` - очищенные страницы
- `blocks` - блоки контента
- `embeddings` - эмбеддинги блоков
- `link_candidates` - кандидаты ссылок
- `generation_runs` - запуски генерации

### Тестовые данные

После инициализации создаются:
- Тестовый пользователь: `test@example.com`
- Тестовый проект: `Test Project`
- Тестовый импорт и задача обработки

## Мониторинг

### Логи

```bash
# Просмотр логов приложения
tail -f app.log

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# Логи Redis
sudo tail -f /var/log/redis/redis-server.log
```

### Статус сервисов

```bash
# PostgreSQL
sudo systemctl status postgresql

# Redis
sudo systemctl status redis-server

# Приложение
ps aux | grep "node.*dist/index.js"
```

## Troubleshooting

### Проблемы с базой данных

```bash
# Проверить подключение
psql -U ai_user -d ai_linking -c "SELECT version();"

# Проверить расширения
psql -U ai_user -d ai_linking -c "\dx"

# Пересоздать базу
sudo -u postgres dropdb ai_linking
sudo -u postgres createdb ai_linking
npm run db:init
```

### Проблемы с портами

```bash
# Проверить занятые порты
netstat -tlnp | grep :3000

# Остановить процесс на порту
sudo kill -9 $(lsof -t -i:3000)
```

### Проблемы с зависимостями

```bash
# Очистить кэш npm
npm cache clean --force

# Переустановить зависимости
rm -rf node_modules package-lock.json
npm install
```
