# Быстрое тестирование Phase 1

## 🚀 Быстрый старт (5 минут)

### 1. Подготовка окружения
```bash
# Установите зависимости
npm install

# Создайте .env файл
echo "DATABASE_URL=postgresql://username:password@localhost:5432/ai_linking
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key" > .env
```

### 2. Запуск сервисов (Docker)
```bash
# PostgreSQL с pgvector
docker run --name postgres-pgvector -e POSTGRES_PASSWORD=password -e POSTGRES_DB=ai_linking -p 5432:5432 -d pgvector/pgvector:pg15

# Redis
docker run --name redis -p 6379:6379 -d redis:alpine
```

### 3. Запуск тестов
```bash
# Полный тест всех компонентов
npm run test:phase1

# Или отдельные тесты
npm run test:queues
npm run test:embeddings
```

## ✅ Что проверяется

### Система очередей (BullMQ + Redis)
- ✅ Подключение к Redis
- ✅ Создание очередей
- ✅ Добавление задач
- ✅ Обработка задач

### Сервис эмбеддингов
- ✅ Нормализация текста
- ✅ Генерация хэшей
- ✅ Кэширование
- ✅ Косинусное сходство

### База данных
- ✅ PostgreSQL подключение
- ✅ pgvector расширение
- ✅ Схема таблиц

## 🧪 Интеграционное тестирование

### 1. Запуск приложения
```bash
npm run dev
```

### 2. Тестирование в браузере
1. Откройте http://localhost:3000
2. Зарегистрируйтесь
3. Создайте проект
4. Загрузите `test-data.csv`
5. Запустите генерацию ссылок

### 3. Мониторинг
```bash
# Redis очереди
redis-cli
KEYS bull:*

# PostgreSQL данные
psql $DATABASE_URL -c "SELECT COUNT(*) FROM embeddings;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM blocks;"
```

## 🐛 Устранение проблем

### Ошибка подключения к PostgreSQL
```bash
# Проверьте Docker контейнер
docker ps | grep postgres

# Перезапустите если нужно
docker restart postgres-pgvector
```

### Ошибка подключения к Redis
```bash
# Проверьте Redis
redis-cli ping

# Перезапустите если нужно
docker restart redis
```

### Ошибки в тестах
```bash
# Проверьте переменные окружения
cat .env

# Перезапустите тесты
npm run test:phase1
```

## 📊 Ожидаемые результаты

После успешного тестирования вы увидите:
```
✅ PostgreSQL подключение успешно
✅ pgvector установлен
✅ Redis подключение успешно
✅ Задачи добавлены в очереди
✅ Тест эмбеддингов завершен
🎉 Phase 1 готова к использованию!
```

## 📚 Дополнительная документация

- `TESTING_PHASE1.md` - подробное руководство
- `PHASE1_README.md` - документация Phase 1
- `run-tests.js` - автоматизированные тесты



