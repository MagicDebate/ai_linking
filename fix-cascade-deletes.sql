-- Исправление CASCADE ограничений для корректного удаления проектов

-- Сначала создаем таблицы embeddings если их нет
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL,
  vector vector(384) NOT NULL,
  text_hash TEXT NOT NULL,
  project_id VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL,
  text_hash TEXT NOT NULL,
  vector vector(384) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'ru',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_used TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 1. Исправляем import_jobs
ALTER TABLE import_jobs 
DROP CONSTRAINT IF EXISTS import_jobs_project_id_fkey;

ALTER TABLE import_jobs 
ADD CONSTRAINT import_jobs_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 2. Исправляем embeddings
ALTER TABLE embeddings 
DROP CONSTRAINT IF EXISTS embeddings_project_id_fkey;

ALTER TABLE embeddings 
ADD CONSTRAINT embeddings_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3. Исправляем embedding_cache
ALTER TABLE embedding_cache 
DROP CONSTRAINT IF EXISTS embedding_cache_project_id_fkey;

ALTER TABLE embedding_cache 
ADD CONSTRAINT embedding_cache_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 4. Исправляем generation_runs
ALTER TABLE generation_runs 
DROP CONSTRAINT IF EXISTS generation_runs_project_id_fkey;

ALTER TABLE generation_runs 
ADD CONSTRAINT generation_runs_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 5. Исправляем project_import_configs
ALTER TABLE project_import_configs 
DROP CONSTRAINT IF EXISTS project_import_configs_project_id_fkey;

ALTER TABLE project_import_configs 
ADD CONSTRAINT project_import_configs_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 6. Исправляем pages_raw (через job_id -> import_jobs -> projects)
-- Сначала добавляем CASCADE к import_jobs.job_id
ALTER TABLE pages_raw 
DROP CONSTRAINT IF EXISTS pages_raw_job_id_fkey;

ALTER TABLE pages_raw 
ADD CONSTRAINT pages_raw_job_id_fkey 
FOREIGN KEY (job_id) REFERENCES import_jobs(job_id) ON DELETE CASCADE;

-- 7. Исправляем graph_meta (через page_id -> pages_clean -> pages_raw -> import_jobs -> projects)
ALTER TABLE graph_meta 
DROP CONSTRAINT IF EXISTS graph_meta_page_id_fkey;

ALTER TABLE graph_meta 
ADD CONSTRAINT graph_meta_page_id_fkey 
FOREIGN KEY (page_id) REFERENCES pages_clean(id) ON DELETE CASCADE;

-- 8. Исправляем link_candidates (через page_id -> pages_clean -> pages_raw -> import_jobs -> projects)
ALTER TABLE link_candidates 
DROP CONSTRAINT IF EXISTS link_candidates_source_page_id_fkey;

ALTER TABLE link_candidates 
ADD CONSTRAINT link_candidates_source_page_id_fkey 
FOREIGN KEY (source_page_id) REFERENCES pages_clean(id) ON DELETE CASCADE;

ALTER TABLE link_candidates 
DROP CONSTRAINT IF EXISTS link_candidates_target_page_id_fkey;

ALTER TABLE link_candidates 
ADD CONSTRAINT link_candidates_target_page_id_fkey 
FOREIGN KEY (target_page_id) REFERENCES pages_clean(id) ON DELETE CASCADE;

-- 9. Исправляем link_candidates (через run_id -> generation_runs -> projects)
ALTER TABLE link_candidates 
DROP CONSTRAINT IF EXISTS link_candidates_run_id_fkey;

ALTER TABLE link_candidates 
ADD CONSTRAINT link_candidates_run_id_fkey 
FOREIGN KEY (run_id) REFERENCES generation_runs(run_id) ON DELETE CASCADE;

-- Проверяем, что все ограничения добавлены
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND (tc.table_name LIKE '%project%' OR ccu.table_name = 'projects')
ORDER BY tc.table_name;
