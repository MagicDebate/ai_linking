#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting database initialization...');

// Проверяем наличие переменных окружения
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

try {
  // 1. Создаем расширение pgvector
  console.log('📦 Installing pgvector extension...');
  execSync('sudo -u postgres psql -d ai_linking -c "CREATE EXTENSION IF NOT EXISTS vector;"', { stdio: 'inherit' });
  
  // 2. Генерируем миграции
  console.log('📝 Generating migrations...');
  execSync('npx drizzle-kit generate', { stdio: 'inherit' });
  
  // 3. Применяем миграции
  console.log('🔄 Applying migrations...');
  execSync('npx drizzle-kit push', { stdio: 'inherit' });
  
  // 4. Создаем тестовые данные
  console.log('👤 Creating test data...');
  const testDataSQL = `
    -- Создание тестового пользователя
    INSERT INTO users (id, email, password_hash, provider) 
    VALUES ('test-user-1', 'test@example.com', '$2b$10$test.hash.for.development', 'LOCAL')
    ON CONFLICT (email) DO NOTHING;
    
    -- Создание тестового проекта
    INSERT INTO projects (id, user_id, name, domain, status) 
    VALUES ('test-project-1', 'test-user-1', 'Test Project', 'example.com', 'READY')
    ON CONFLICT (id) DO NOTHING;
    
    -- Создание тестового импорта
    INSERT INTO imports (id, project_id, file_name, status) 
    VALUES ('test-import-1', 'test-project-1', 'test.csv', 'PROCESSED')
    ON CONFLICT (id) DO NOTHING;
    
    -- Создание тестовой задачи импорта
    INSERT INTO import_jobs (id, job_id, project_id, import_id, status, phase, percent) 
    VALUES ('test-job-1', 'default-job', 'test-project-1', 'test-import-1', 'completed', 'completed', 100)
    ON CONFLICT (id) DO NOTHING;
  `;
  
  fs.writeFileSync('test-data.sql', testDataSQL);
  execSync('sudo -u postgres psql -d ai_linking -f test-data.sql', { stdio: 'inherit' });
  fs.unlinkSync('test-data.sql');
  
  console.log('✅ Database initialization completed successfully!');
  console.log('📊 Test user: test@example.com');
  console.log('🔑 Test project: Test Project');
  
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  process.exit(1);
}
