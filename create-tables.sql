-- Создание enum типов
CREATE TYPE provider AS ENUM ('LOCAL', 'GOOGLE');
CREATE TYPE project_status AS ENUM ('QUEUED', 'READY');

-- Таблица пользователей
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  provider provider NOT NULL DEFAULT 'LOCAL',
  google_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица проектов
CREATE TABLE projects (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  status project_status NOT NULL DEFAULT 'QUEUED',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица прогресса пользователей
CREATE TABLE user_progress (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  create_project TEXT NOT NULL DEFAULT 'false',
  upload_texts TEXT NOT NULL DEFAULT 'false',
  set_priorities TEXT NOT NULL DEFAULT 'false',
  generate_draft TEXT NOT NULL DEFAULT 'false',
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица состояний проектов для системы чекпоинтов
CREATE TABLE project_states (
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

-- Таблица уведомлений
CREATE TABLE notifications (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  link TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  dismissed TEXT NOT NULL DEFAULT 'false',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица API ключей проектов
CREATE TABLE project_api_keys (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица импортов
CREATE TABLE imports (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  field_mapping TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица задач импорта
CREATE TABLE import_jobs (
  id VARCHAR(50) PRIMARY KEY,
  job_id VARCHAR(50) UNIQUE NOT NULL,
  project_id VARCHAR REFERENCES projects(id) NOT NULL,
  import_id VARCHAR REFERENCES imports(id) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  phase VARCHAR(50) NOT NULL DEFAULT 'loading',
  percent INTEGER NOT NULL DEFAULT 0,
  pages_total INTEGER NOT NULL DEFAULT 0,
  pages_done INTEGER NOT NULL DEFAULT 0,
  blocks_done INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  avg_word_count INTEGER NOT NULL DEFAULT 0,
  deep_pages INTEGER NOT NULL DEFAULT 0,
  avg_click_depth REAL NOT NULL DEFAULT 0,
  import_duration INTEGER,
  logs TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP
);

-- Таблица сырых страниц
CREATE TABLE pages_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id VARCHAR(50) REFERENCES import_jobs(job_id) NOT NULL,
  url TEXT NOT NULL,
  raw_html TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица очищенных страниц
CREATE TABLE pages_clean (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_raw_id UUID REFERENCES pages_raw(id) NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица блоков
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages_clean(id) NOT NULL,
  text TEXT NOT NULL,
  block_type VARCHAR(20) NOT NULL DEFAULT 'p',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица эмбеддингов
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) NOT NULL,
  vector vector(384) NOT NULL,
  text_hash VARCHAR(64) NOT NULL,
  project_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица кэша эмбеддингов
CREATE TABLE embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash VARCHAR(64) NOT NULL,
  vector vector(384) NOT NULL,
  project_id VARCHAR NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'ru',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_used TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица метаданных графа
CREATE TABLE graph_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages_clean(id) NOT NULL,
  click_depth INTEGER NOT NULL DEFAULT 0,
  in_degree INTEGER NOT NULL DEFAULT 0,
  out_degree INTEGER NOT NULL DEFAULT 0,
  is_orphan BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица кандидатов ссылок
CREATE TABLE link_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR NOT NULL,
  source_page_id UUID REFERENCES pages_clean(id) NOT NULL,
  target_page_id UUID REFERENCES pages_clean(id) NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT NOT NULL,
  scenario VARCHAR(50) NOT NULL,
  is_rejected BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Таблица запусков генерации
CREATE TABLE generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR UNIQUE NOT NULL,
  project_id VARCHAR NOT NULL,
  import_id VARCHAR NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  phase VARCHAR(50) NOT NULL DEFAULT 'initialization',
  percent INTEGER NOT NULL DEFAULT 0,
  generated INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  finished_at TIMESTAMP
);

-- Создание индексов для производительности
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_project_states_project_id ON project_states(project_id);
CREATE INDEX idx_project_states_user_id ON project_states(user_id);
CREATE INDEX idx_pages_raw_job_id ON pages_raw(job_id);
CREATE INDEX idx_pages_clean_page_raw_id ON pages_clean(page_raw_id);
CREATE INDEX idx_blocks_page_id ON blocks(page_id);
CREATE INDEX idx_embeddings_block_id ON embeddings(block_id);
CREATE INDEX idx_embeddings_project_id ON embeddings(project_id);
CREATE INDEX idx_embedding_cache_text_hash ON embedding_cache(text_hash);
CREATE INDEX idx_graph_meta_page_id ON graph_meta(page_id);
CREATE INDEX idx_link_candidates_run_id ON link_candidates(run_id);
CREATE INDEX idx_generation_runs_run_id ON generation_runs(run_id);

-- Создание тестового пользователя
INSERT INTO users (id, email, password_hash, provider) VALUES 
('test-user-1', 'test@example.com', '$2b$10$test.hash.for.development', 'LOCAL');

-- Создание тестового проекта
INSERT INTO projects (id, user_id, name, domain, status) VALUES 
('test-project-1', 'test-user-1', 'Test Project', 'example.com', 'READY');
