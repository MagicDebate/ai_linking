-- Обновление схемы для исправления типа runId
-- Выполнить на сервере для применения изменений

-- 1. Удаляем существующие таблицы с неправильными типами
DROP TABLE IF EXISTS link_candidates CASCADE;
DROP TABLE IF EXISTS broken_urls CASCADE;
DROP TABLE IF EXISTS generation_runs CASCADE;

-- 2. Создаем таблицу generation_runs с правильным типом runId
CREATE TABLE generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(50) UNIQUE NOT NULL,
  project_id VARCHAR(255) NOT NULL REFERENCES projects(id),
  import_id VARCHAR(255) NOT NULL REFERENCES imports(id),
  status run_status NOT NULL DEFAULT 'running',
  phase VARCHAR(50) NOT NULL DEFAULT 'starting',
  percent INTEGER NOT NULL DEFAULT 0,
  generated INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  task_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP,
  error_message TEXT
);

-- 3. Создаем таблицу link_candidates с правильным типом runId
CREATE TABLE link_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(50) NOT NULL REFERENCES generation_runs(run_id),
  source_page_id UUID NOT NULL REFERENCES pages_clean(id),
  target_page_id UUID NOT NULL REFERENCES pages_clean(id),
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'accepted',
  anchor_source VARCHAR(20) NOT NULL DEFAULT 'text',
  confidence REAL,
  reason TEXT,
  position_hint JSONB,
  similarity REAL,
  css_class TEXT,
  rel_attribute TEXT,
  target_attribute TEXT,
  modified_sentence TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 4. Создаем таблицу broken_urls с правильным типом runId
CREATE TABLE broken_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(50) NOT NULL REFERENCES generation_runs(run_id),
  url TEXT NOT NULL,
  checked_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 5. Создаем индексы для производительности
CREATE INDEX idx_generation_runs_project_id ON generation_runs(project_id);
CREATE INDEX idx_generation_runs_status ON generation_runs(status);
CREATE INDEX idx_link_candidates_run_id ON link_candidates(run_id);
CREATE INDEX idx_link_candidates_source_page_id ON link_candidates(source_page_id);
CREATE INDEX idx_link_candidates_target_page_id ON link_candidates(target_page_id);
CREATE INDEX idx_broken_urls_run_id ON broken_urls(run_id);

-- 6. Создаем enum для статусов если его нет
DO $$ BEGIN
    CREATE TYPE run_status AS ENUM ('running', 'draft', 'published', 'failed', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
