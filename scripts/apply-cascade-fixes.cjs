#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyCascadeFixes() {
  const client = new Client(process.env.DATABASE_URL);
  
  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    
    const sqlFile = path.join(__dirname, '..', 'fix-cascade-deletes.sql');
    
    if (!fs.existsSync(sqlFile)) {
      console.error('❌ fix-cascade-deletes.sql not found');
      process.exit(1);
    }
    
    console.log('📝 Reading SQL file...');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('🔧 Applying CASCADE fixes...');
    await client.query(sql);
    
    console.log('✅ CASCADE fixes applied successfully!');
    
  } catch (error) {
    console.error('❌ Error applying CASCADE fixes:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Загружаем переменные окружения
require('dotenv').config();

applyCascadeFixes();
