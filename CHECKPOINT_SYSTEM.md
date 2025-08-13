# Система чекпоинтов (Checkpoint System)

## Обзор

Система чекпоинтов позволяет сохранять состояние пользователя во время работы с проектом и восстанавливать его после обновления страницы или случайного выхода.

## Как это работает

### 1. Автоматическое сохранение
- **Шаг 1 (Загрузка CSV)**: Сохраняется информация о загруженном файле и preview данных
- **Шаг 2 (Настройка SEO)**: Сохраняется SEO профиль и все настройки
- **Шаг 3 (Импорт)**: Сохраняется ID импорт джоба
- **Переходы между шагами**: Автоматически сохраняется текущий шаг

### 2. Восстановление состояния
При загрузке страницы система автоматически:
- Восстанавливает текущий шаг
- Восстанавливает SEO профиль
- Восстанавливает данные о загруженном файле
- Восстанавливает ID импорт джоба (если импорт был запущен)

## Структура данных

### Таблица `project_states`
```sql
CREATE TABLE project_states (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  step_data JSONB NOT NULL DEFAULT '{}',
  last_completed_step INTEGER NOT NULL DEFAULT 0,
  import_job_id VARCHAR,
  seo_profile JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Поля step_data
```json
{
  "csvPreview": {
    "headers": ["url", "title", "content"],
    "rows": [["https://example.com", "Title", "Content"]],
    "uploadId": "upload_123"
  },
  "fieldMapping": {
    "url": "url",
    "title": "title",
    "content": "content"
  },
  "uploadedFile": {
    "name": "data.csv",
    "size": 1024
  }
}
```

## API Endpoints

### GET `/api/projects/:id/state`
Получение состояния проекта

**Ответ:**
```json
{
  "currentStep": 2,
  "lastCompletedStep": 1,
  "stepData": {...},
  "importJobId": "job_123",
  "seoProfile": {...},
  "hasImports": true,
  "projectId": "project_123"
}
```

### POST `/api/projects/:id/state`
Сохранение состояния проекта

**Тело запроса:**
```json
{
  "currentStep": 2,
  "stepData": {...},
  "importJobId": "job_123",
  "seoProfile": {...}
}
```

## Использование на фронтенде

### Хук useProjectState
```typescript
const { 
  projectState, 
  setCurrentStep, 
  setImportJobId, 
  setSeoProfile, 
  setStepData 
} = useProjectState(projectId);

// Сохранение шага
await setCurrentStep(2);

// Сохранение SEO профиля
await setSeoProfile(profile);

// Сохранение данных шага
await setStepData({ fieldMapping: mapping });
```

## Преимущества

1. **Не теряется прогресс** - пользователь может обновить страницу без потери данных
2. **Автоматическое восстановление** - система сама восстанавливает состояние
3. **Гибкость** - можно сохранять любые данные в JSON формате
4. **Производительность** - данные кэшируются в React Query

## Ограничения

1. **Файлы** - сами файлы не сохраняются, только метаданные
2. **Размер данных** - большие объекты могут замедлить работу
3. **Конфликты** - при одновременной работе нескольких вкладок могут быть конфликты

## Будущие улучшения

1. **Версионирование** - сохранение истории изменений
2. **Синхронизация** - синхронизация между вкладками
3. **Экспорт/импорт** - возможность экспорта состояния
4. **Автоочистка** - автоматическое удаление старых состояний

