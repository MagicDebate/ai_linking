const { EmbeddingService } = require('./server/embeddingService');

async function testEmbeddings() {
  console.log('🧪 Тестирование сервиса эмбеддингов...');
  
  try {
    const embeddingService = new EmbeddingService();
    
    // Тест нормализации текста
    const normalized = embeddingService.normalizeText('Тестовый текст с HTML <p>тегами</p>');
    console.log('📝 Нормализованный текст:', normalized);
    
    // Тест генерации хэша
    const hash = embeddingService.generateTextHash('тестовый текст');
    console.log('🔐 Хэш текста:', hash);
    
    // Тест кэширования
    const cached = await embeddingService.getCachedEmbedding(hash, 'test-project');
    console.log('💾 Кэш:', cached ? 'найден' : 'не найден');
    
    // Тест генерации эмбеддинга
    const embedding = await embeddingService.generateEmbedding('тестовый текст');
    console.log('🎯 Эмбеддинг:', embedding.length, 'размеров');
    
    // Тест косинусного сходства
    const vector1 = [1, 0, 0, 0];
    const vector2 = [0, 1, 0, 0];
    const vector3 = [1, 0, 0, 0];
    
    const similarity1 = embeddingService.cosineSimilarity(vector1, vector2);
    const similarity2 = embeddingService.cosineSimilarity(vector1, vector3);
    
    console.log('📊 Сходство ортогональных векторов:', similarity1);
    console.log('📊 Сходство одинаковых векторов:', similarity2);
    
    console.log('✅ Тест эмбеддингов завершен');
    
  } catch (error) {
    console.error('❌ Ошибка тестирования эмбеддингов:', error.message);
  }
}

testEmbeddings().catch(console.error);



