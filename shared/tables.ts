// Центральный файл для всех таблиц - избегаем циклических зависимостей
console.log('🔄 [TABLES] Loading tables.ts...');

// Экспортируем все таблицы напрямую
export * from './schema';
export * from './embeddings-schema';

console.log('✅ [TABLES] All tables exported successfully');
console.log('✅ [TABLES] tables.ts loaded completely');
