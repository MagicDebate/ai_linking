#!/usr/bin/env node

import { Client } from 'pg';
import fs from 'fs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ai_user:pass123456@38.180.101.147:5432/ai_linking';

async function fixDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully');

    // Читаем SQL файл
    const sqlContent = fs.readFileSync('./add-project-states.sql', 'utf8');
    
    console.log('📝 Applying SQL changes...');
    await client.query(sqlContent);
    
    console.log('✅ Table project_states created successfully!');
    
    // Проверяем, что таблица создана
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'project_states'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Verification: project_states table exists');
    } else {
      console.log('❌ Verification failed: project_states table not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixDatabase();
