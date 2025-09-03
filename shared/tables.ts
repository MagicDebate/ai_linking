// Центральный файл для всех таблиц - избегаем циклических зависимостей
console.log('🔄 [TABLES] Loading tables.ts...');

try {
  console.log('📦 [TABLES] Importing schema.ts...');
  const schema = await import('./schema');
  console.log('✅ [TABLES] schema.ts imported successfully');
  
  console.log('📦 [TABLES] Importing embeddings-schema.ts...');
  const embeddingsSchema = await import('./embeddings-schema');
  console.log('✅ [TABLES] embeddings-schema.ts imported successfully');
  
  console.log('🔍 [TABLES] Available exports from schema:', Object.keys(schema));
  console.log('🔍 [TABLES] Available exports from embeddings-schema:', Object.keys(embeddingsSchema));
  
  // Экспортируем все таблицы
  export * from './schema';
  export * from './embeddings-schema';
  
  console.log('✅ [TABLES] All tables exported successfully');
} catch (error) {
  console.error('💥 [TABLES] Error loading tables:', error);
  throw error;
}
