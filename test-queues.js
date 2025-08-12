const { importQueue, embeddingQueue, linkGenerationQueue } = require('./server/queue');

async function testQueues() {
  console.log('🧪 Тестирование системы очередей...');
  
  try {
    // Тест добавления задач
    await importQueue.add('test-import', { 
      projectId: 'test-project',
      filePath: '/test/file.csv'
    });
    
    await embeddingQueue.add('test-embedding', {
      blockIds: ['block1', 'block2'],
      projectId: 'test-project'
    });
    
    await linkGenerationQueue.add('test-generation', {
      projectId: 'test-project',
      scenarios: ['orphan-fix']
    });
    
    console.log('✅ Задачи добавлены в очереди');
    
    // Проверка статуса очередей
    const importJobs = await importQueue.getJobs(['waiting', 'active']);
    const embeddingJobs = await embeddingQueue.getJobs(['waiting', 'active']);
    const generationJobs = await linkGenerationQueue.getJobs(['waiting', 'active']);
    
    console.log(`📊 Очереди: Import=${importJobs.length}, Embedding=${embeddingJobs.length}, Generation=${generationJobs.length}`);
    
    // Очистка тестовых задач
    await importQueue.clean(0, 'active');
    await embeddingQueue.clean(0, 'active');
    await linkGenerationQueue.clean(0, 'active');
    
    console.log('🧹 Тестовые задачи очищены');
    
  } catch (error) {
    console.error('❌ Ошибка тестирования очередей:', error.message);
  }
}

testQueues().catch(console.error);


