-- Добавление таблицы состояний проектов для системы чекпоинтов
CREATE TABLE IF NOT EXISTS project_states (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  step_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_completed_step INTEGER NOT NULL DEFAULT 0,
  import_job_id VARCHAR(50),
  seo_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Создание индексов для таблицы project_states
CREATE INDEX IF NOT EXISTS idx_project_states_project_id ON project_states(project_id);
CREATE INDEX IF NOT EXISTS idx_project_states_user_id ON project_states(user_id);
