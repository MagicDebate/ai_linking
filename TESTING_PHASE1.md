# Тестирование Phase 1 - Руководство

## Предварительные требования

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка переменных окружения
Создайте файл `.env` в корне проекта:

```env
# База данных PostgreSQL
DATABASE_URL=postgresql://username:password@localhost:5432/ai_linking

# Redis для очередей
REDIS_URL=redis://localhost:6379

# JWT секрет
JWT_SECRET=your-secret-key

# Google OAuth (опционально)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Запуск необходимых сервисов

#### PostgreSQL с pgvector
```bash
# Если используете Docker
docker run --name postgres-pgvector -e POSTGRES_PASSWORD=password -e POSTGRES_DB=ai_linking -p 5432:5432 -d pgvector/pgvector:pg15

# Или установите pgvector в существующую PostgreSQL
# https://github.com/pgvector/pgvector#installation
```

#### Redis
```bash
# Docker
docker run --name redis -p 6379:6379 -d redis:alpine

# Или установите Redis локально
# https://redis.io/download
```

## Пошаговое тестирование

### Шаг 1: Проверка подключений

#### 1.1 Тест подключения к PostgreSQL
```bash
# Проверьте подключение к базе данных
psql $DATABASE_URL -c "SELECT version();"
```

#### 1.2 Тест pgvector
```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

#### 1.3 Тест подключения к Redis
```bash
redis-cli ping
# Должен ответить: PONG
```

### Шаг 2: Миграция базы данных

```bash
# Запустите миграции Drizzle
npm run db:migrate
# или
npx drizzle-kit migrate
```

### Шаг 3: Запуск приложения

```bash
# В одном терминале запустите сервер
npm run dev

# В другом терминале запустите клиент (если нужно)
npm run client
```

### Шаг 4: Тестирование компонентов

#### 4.1 Тест системы очередей

Создайте файл `test-queues.js`:

```javascript
const { importQueue, embeddingQueue, linkGenerationQueue } = require('./server/queue');

async function testQueues() {
  console.log('🧪 Тестирование системы очередей...');
  
  // Тест добавления задач
  await importQueue.add('test-import', { 
    projectId: 'test-project',
    filePath: '/test/file.csv'
  });
  
  await embeddingQueue.add('test-embedding', {
    blockIds: ['block1', 'block2'],
    projectId: 'test-project'
  });
  
  await linkGenerationQueue.add('test-generation', {
    projectId: 'test-project',
    scenarios: ['orphan-fix']
  });
  
  console.log('✅ Задачи добавлены в очереди');
  
  // Проверка статуса очередей
  const importJobs = await importQueue.getJobs(['waiting', 'active']);
  const embeddingJobs = await embeddingQueue.getJobs(['waiting', 'active']);
  const generationJobs = await linkGenerationQueue.getJobs(['waiting', 'active']);
  
  console.log(`📊 Очереди: Import=${importJobs.length}, Embedding=${embeddingJobs.length}, Generation=${generationJobs.length}`);
}

testQueues().catch(console.error);
```

#### 4.2 Тест сервиса эмбеддингов

Создайте файл `test-embeddings.js`:

```javascript
const { EmbeddingService } = require('./server/embeddingService');
const { db } = require('./server/db');

async function testEmbeddings() {
  console.log('🧪 Тестирование сервиса эмбеддингов...');
  
  const embeddingService = new EmbeddingService();
  
  // Тест нормализации текста
  const normalized = embeddingService.normalizeText('Тестовый текст с HTML <p>тегами</p>');
  console.log('📝 Нормализованный текст:', normalized);
  
  // Тест генерации хэша
  const hash = embeddingService.generateTextHash('тестовый текст');
  console.log('🔐 Хэш текста:', hash);
  
  // Тест кэширования
  const cached = await embeddingService.getCachedEmbedding(hash, 'test-project');
  console.log('💾 Кэш:', cached ? 'найден' : 'не найден');
  
  // Тест генерации эмбеддинга
  const embedding = await embeddingService.generateEmbedding('тестовый текст');
  console.log('🎯 Эмбеддинг:', embedding.length, 'размеров');
  
  console.log('✅ Тест эмбеддингов завершен');
}

testEmbeddings().catch(console.error);
```

#### 4.3 Тест косинусного сходства

Создайте файл `test-similarity.js`:

```javascript
const { EmbeddingService } = require('./server/embeddingService');

function testCosineSimilarity() {
  console.log('🧪 Тестирование косинусного сходства...');
  
  const embeddingService = new EmbeddingService();
  
  // Тестовые векторы
  const vector1 = [1, 0, 0, 0];
  const vector2 = [0, 1, 0, 0];
  const vector3 = [1, 0, 0, 0];
  
  const similarity1 = embeddingService.cosineSimilarity(vector1, vector2);
  const similarity2 = embeddingService.cosineSimilarity(vector1, vector3);
  
  console.log('📊 Сходство ортогональных векторов:', similarity1);
  console.log('📊 Сходство одинаковых векторов:', similarity2);
  
  console.log('✅ Тест сходства завершен');
}

testCosineSimilarity();
```

### Шаг 5: Интеграционное тестирование

#### 5.1 Создание тестового проекта

1. Откройте приложение в браузере
2. Зарегистрируйтесь или войдите в систему
3. Создайте новый проект
4. Загрузите тестовый CSV файл

#### 5.2 Тестовый CSV файл

Создайте файл `test-data.csv`:

```csv
url,title,content
https://example.com/page1,Страница 1,Это первая тестовая страница с контентом о SEO
https://example.com/page2,Страница 2,Вторая страница о маркетинге и продвижении
https://example.com/page3,Страница 3,Третья страница с информацией о веб-разработке
https://example.com/page4,Страница 4,Четвертая страница о дизайне и UX
https://example.com/page5,Страница 5,Пятая страница о контент-маркетинге
```

#### 5.3 Тест процесса импорта

1. Загрузите `test-data.csv`
2. Наблюдайте за прогрессом в консоли браузера
3. Проверьте, что задачи добавляются в очереди Redis
4. Убедитесь, что эмбеддинги генерируются

#### 5.4 Тест генерации ссылок

1. Перейдите к генерации ссылок
2. Запустите генерацию с одним сценарием
3. Проверьте, что задача добавляется в очередь
4. Наблюдайте за прогрессом

### Шаг 6: Мониторинг и отладка

#### 6.1 Мониторинг Redis

```bash
# Подключитесь к Redis CLI
redis-cli

# Просмотр активных очередей
KEYS bull:*

# Просмотр задач в очереди
LRANGE bull:import-processing:wait 0 -1
LRANGE bull:embedding-generation:wait 0 -1
LRANGE bull:link-generation:wait 0 -1
```

#### 6.2 Мониторинг PostgreSQL

```bash
# Проверка таблиц
psql $DATABASE_URL -c "\dt"

# Проверка эмбеддингов
psql $DATABASE_URL -c "SELECT COUNT(*) FROM embeddings;"

# Проверка кэша
psql $DATABASE_URL -c "SELECT COUNT(*) FROM embedding_cache;"

# Проверка блоков
psql $DATABASE_URL -c "SELECT COUNT(*) FROM blocks;"
```

#### 6.3 Логи приложения

Следите за логами в консоли сервера:

```bash
# Запустите сервер с подробными логами
DEBUG=* npm run dev
```

### Шаг 7: Проверка производительности

#### 7.1 Тест батчевой обработки

Создайте большой тестовый файл (1000+ строк) и измерьте время обработки.

#### 7.2 Тест кэширования

1. Запустите импорт дважды с одинаковыми данными
2. Убедитесь, что второй запуск использует кэш

#### 7.3 Тест масштабирования

```bash
# Нагрузочный тест с помощью Apache Bench
ab -n 100 -c 10 http://localhost:3000/api/projects
```

## Ожидаемые результаты

### ✅ Успешные тесты

1. **Подключения**: Все сервисы (PostgreSQL, Redis) доступны
2. **Очереди**: Задачи добавляются и обрабатываются
3. **Эмбеддинги**: Генерируются и кэшируются
4. **Сходство**: Косинусное сходство работает корректно
5. **Импорт**: CSV файлы обрабатываются асинхронно
6. **Генерация**: Ссылки генерируются через очереди

### ⚠️ Известные ограничения

1. **Placeholder эмбеддинги**: Сейчас генерируются случайные векторы
2. **Простая логика сценариев**: Базовая реализация
3. **Отсутствие реальной NLP модели**: Нужно подключить S-BERT

## Устранение неполадок

### Проблема: Ошибка подключения к PostgreSQL
```bash
# Проверьте переменную DATABASE_URL
echo $DATABASE_URL

# Проверьте доступность базы
pg_isready -h localhost -p 5432
```

### Проблема: Ошибка подключения к Redis
```bash
# Проверьте Redis
redis-cli ping

# Перезапустите Redis
docker restart redis
```

### Проблема: Ошибки миграции
```bash
# Сбросьте базу и пересоздайте
npx drizzle-kit drop
npx drizzle-kit migrate
```

### Проблема: Задачи не обрабатываются
```bash
# Проверьте воркеры
ps aux | grep node

# Перезапустите сервер
npm run dev
```

## Следующие шаги

После успешного тестирования Phase 1:

1. **Phase 2**: Интеграция реальной NLP модели (S-BERT)
2. **Phase 3**: Расширенные сценарии и оптимизации
3. **Мониторинг**: Добавление метрик и алертов
4. **Документация**: Обновление пользовательской документации

## Контакты для поддержки

Если возникнут проблемы при тестировании:

1. Проверьте логи в консоли
2. Убедитесь в корректности переменных окружения
3. Проверьте доступность всех сервисов
4. Обратитесь к документации Phase 1 (`PHASE1_README.md`)
