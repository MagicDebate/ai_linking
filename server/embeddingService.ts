import { db } from './db';
import { embeddingCache, blocks, pagesClean } from '@shared/tables';
import { eq, and, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { embeddingQueue } from './queue';

// Конфигурация TensorFlow.js для избежания WebSocket ошибок
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  // Отключаем автоматическую загрузку моделей в production
  process.env.TFJS_BACKEND = 'cpu';
  process.env.TFJS_DISABLE_WEBSOCKET = 'true';
}

// Интерфейсы для работы с эмбеддингами
interface BlockData {
  id: string;
  text: string;
  blockType: string;
  pageId: string;
}

interface EmbeddingResult {
  blockId: string;
  vector: number[];
  textHash: string;
  cached: boolean;
}

interface SimilarityResult {
  blockId: string;
  similarity: number;
  pageScore: number;
  structuralBonus: number;
}

interface BatchConfig {
  batchSize: number;
  timeout: number;
  retries: number;
}

export class EmbeddingService {
  private batchConfig: BatchConfig = {
    batchSize: 32,
    timeout: 30000, // 30 секунд
    retries: 3
  };

  private lruCache = new Map<string, number[]>();
  private readonly maxCacheSize = 20000; // 20k эмбеддингов в памяти

  constructor() {
    // Автонастройка размера батча при старте
    this.autoAdjustBatchSize();
  }

  /**
   * Нормализация текста для хэширования
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ') // Удаляем HTML теги
      .replace(/\s+/g, ' ') // Унифицируем пробелы
      .replace(/[^\w\s]/g, '') // Удаляем не-буквенные символы в конце
      .trim();
  }

  /**
   * Генерация SHA-256 хэша для текста
   */
  private generateTextHash(text: string): string {
    const normalizedText = this.normalizeText(text);
    return crypto.createHash('sha256').update(normalizedText).digest('hex');
  }

  /**
   * Измерение латентности батча
   */
  private async measureBatchLatency(batchSize: number): Promise<number> {
    const startTime = Date.now();
    
    // Создаем тестовые данные
    const testBlocks = Array.from({ length: batchSize }, (_, i) => ({
      id: `test-${i}`,
      text: `Test block ${i} with some content for latency measurement`,
      blockType: 'p',
      pageId: 'test-page'
    }));

    try {
      // Используем null вместо несуществующего projectId для тестирования
      await this.processBatch(testBlocks, null);
      const endTime = Date.now();
      return (endTime - startTime) / 1000; // Возвращаем в секундах
    } catch (error) {
      console.error('Error measuring batch latency:', error);
      return 5.0; // Возвращаем высокую латентность при ошибке
    }
  }

  /**
   * Автонастройка размера батча
   */
  private async autoAdjustBatchSize(): Promise<void> {
    console.log('🔧 Auto-adjusting batch size...');
    
    // Измеряем латентность для текущего размера батча
    const latency = await this.measureBatchLatency(this.batchConfig.batchSize);
    console.log(`📊 Current batch size: ${this.batchConfig.batchSize}, latency: ${latency}s`);
    
    if (latency > 2.0) {
      // Уменьшаем размер батча
      const newBatchSize = Math.max(8, Math.floor(this.batchConfig.batchSize / 2));
      console.log(`📉 Reducing batch size from ${this.batchConfig.batchSize} to ${newBatchSize}`);
      this.batchConfig.batchSize = newBatchSize;
    } else if (latency < 0.5) {
      // Увеличиваем размер батча
      const newBatchSize = Math.min(128, Math.floor(this.batchConfig.batchSize * 1.5));
      console.log(`📈 Increasing batch size from ${this.batchConfig.batchSize} to ${newBatchSize}`);
      this.batchConfig.batchSize = newBatchSize;
    }
    
    console.log(`✅ Batch size adjusted to: ${this.batchConfig.batchSize}`);
  }

  /**
   * Получение эмбеддинга из кэша
   */
  private async getCachedEmbedding(textHash: string, projectId: string): Promise<number[] | null> {
    // Сначала проверяем память
    if (this.lruCache.has(textHash)) {
      const vector = this.lruCache.get(textHash)!;
      // Обновляем время последнего использования
      this.lruCache.delete(textHash);
      this.lruCache.set(textHash, vector);
      return vector;
    }

    // Затем проверяем БД
    const cachedEmbedding = await db
      .select({ vector: embeddingCache.vector })
      .from(embeddingCache)
      .where(
        and(
          eq(embeddingCache.textHash, textHash),
          eq(embeddingCache.projectId, projectId)
        )
      )
      .limit(1);

    if (cachedEmbedding.length > 0) {
      const vector = cachedEmbedding[0].vector as number[];
      
      // Добавляем в память
      this.addToMemoryCache(textHash, vector);
      
      // Обновляем время последнего использования
      await db
        .update(embeddingCache)
        .set({ lastUsed: new Date() })
        .where(
          and(
            eq(embeddingCache.textHash, textHash),
            eq(embeddingCache.projectId, projectId)
          )
        );
      
      return vector;
    }

    return null;
  }

  /**
   * Добавление эмбеддинга в кэш памяти
   */
  private addToMemoryCache(textHash: string, vector: number[]): void {
    // Удаляем старые записи если кэш переполнен
    if (this.lruCache.size >= this.maxCacheSize) {
      const firstKey = this.lruCache.keys().next().value;
      this.lruCache.delete(firstKey);
    }
    
    this.lruCache.set(textHash, vector);
  }

  /**
   * Сохранение эмбеддинга в кэш БД
   */
  private async saveToCache(textHash: string, vector: number[], projectId: string): Promise<void> {
    await db.insert(embeddingCache).values({
      textHash,
      vector: vector as any, // Cast to any to work with pgvector
      projectId,
      language: 'ru', // По умолчанию русский
      createdAt: new Date(),
      lastUsed: new Date()
    }).onConflictDoNothing(); // Игнорируем дубликаты
  }

  /**
   * Генерация эмбеддинга для блока текста
   * PLACEHOLDER: В реальной реализации здесь будет вызов модели
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // FIX ENCODING: Исправляем кодировку перед генерацией эмбеддинга
    let fixedText = text;
    if (text.includes('')) {
      try {
        console.log('🔧 [EMBEDDING] Fixing encoding for text with diamonds');
        const buffer = Buffer.from(text, 'binary');
        fixedText = buffer.toString('utf-8');
        console.log('✅ [EMBEDDING] Successfully fixed encoding');
      } catch (error) {
        console.log('⚠️ [EMBEDDING] Failed to fix encoding, using original text');
        fixedText = text;
      }
    }
    
    // PLACEHOLDER: Заменяем на реальную модель (например, S-BERT MiniLM)
    // const model = await loadModel();
    // const embedding = await model.embed(fixedText);
    // return embedding;
    
    // Временная заглушка - создаем случайный вектор
    const vector = Array.from({ length: 384 }, () => Math.random() * 2 - 1);
    
    // Нормализуем вектор
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }

  /**
   * Обработка батча блоков
   */
  private async processBatch(blocks: BlockData[], projectId: string | null): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    for (const block of blocks) {
      const textHash = this.generateTextHash(block.text);
      
      // Проверяем кэш только если projectId не null
      let vector: number[] | null = null;
      let cached = false;
      
      if (projectId && typeof projectId === 'string') {
        vector = await this.getCachedEmbedding(textHash, projectId);
        cached = !!vector;
      }
      
      if (!vector) {
        // Генерируем новый эмбеддинг
        vector = await this.generateEmbedding(block.text);
        cached = false;
        
        // Сохраняем в кэш только если projectId не null
        if (projectId && typeof projectId === 'string') {
          await this.saveToCache(textHash, vector, projectId);
          this.addToMemoryCache(textHash, vector);
        }
      }
      
      results.push({
        blockId: block.id,
        vector,
        textHash,
        cached
      });
    }
    
    return results;
  }

  /**
   * Основной метод для генерации эмбеддингов
   */
  async generateEmbeddings(blockIds: string[], projectId: string, embeddingsTable?: any): Promise<EmbeddingResult[]> {
    console.log(`🔢 Generating embeddings for ${blockIds.length} blocks`);
    
    // Получаем данные блоков
    const blocksData = await db
      .select({
        id: blocks.id,
        text: blocks.text,
        blockType: blocks.blockType,
        pageId: blocks.pageId
      })
      .from(blocks)
      .where(inArray(blocks.id, blockIds));

    if (blocksData.length === 0) {
      console.log('⚠️ No blocks found for embedding generation');
      return [];
    }

    const results: EmbeddingResult[] = [];
    
    // Обрабатываем батчами
    for (let i = 0; i < blocksData.length; i += this.batchConfig.batchSize) {
      const batch = blocksData.slice(i, i + this.batchConfig.batchSize);
      
      try {
        const batchResults = await this.processBatch(batch, projectId);
        results.push(...batchResults);
        
        console.log(`✅ Processed batch ${Math.floor(i / this.batchConfig.batchSize) + 1}/${Math.ceil(blocksData.length / this.batchConfig.batchSize)}`);
      } catch (error) {
        console.error(`❌ Error processing batch:`, error);
        
        // Если батч слишком большой, уменьшаем размер и повторяем
        if (this.batchConfig.batchSize > 8) {
          console.log(`🔄 Reducing batch size and retrying...`);
          this.batchConfig.batchSize = Math.max(8, Math.floor(this.batchConfig.batchSize / 2));
          
          // Повторяем с меньшим батчем
          const retryResults = await this.processBatch(batch, projectId);
          results.push(...retryResults);
        } else {
          throw error;
        }
      }
    }

    // Сохраняем эмбеддинги в БД
    if (embeddingsTable) {
      await this.saveEmbeddingsToDB(results, projectId, embeddingsTable);
    } else {
      console.log(`⚠️ Skipped saving embeddings - no table provided`);
    }
    
    console.log(`✅ Generated ${results.length} embeddings (${results.filter(r => !r.cached).length} new, ${results.filter(r => r.cached).length} cached)`);
    return results;
  }

  /**
   * Сохранение эмбеддингов в БД
   */
  private async saveEmbeddingsToDB(results: EmbeddingResult[], projectId: string, embeddingsTable?: any): Promise<void> {
    const embeddingsToInsert = results.map(result => ({
      blockId: result.blockId,
      vector: result.vector as any, // Cast to any to work with pgvector
      textHash: result.textHash,
      projectId
    }));

    // Передаем embeddings как параметр для избежания циклических зависимостей
    if (embeddingsTable) {
      await db.insert(embeddingsTable).values(embeddingsToInsert).onConflictDoNothing();
      console.log(`✅ Inserted ${embeddingsToInsert.length} embeddings`);
    } else {
      console.log(`⚠️ Skipped inserting ${embeddingsToInsert.length} embeddings - no table provided`);
    }
  }

  /**
   * Поиск похожих блоков по cosine similarity
   */
  async findSimilarBlocks(
    sourceBlockId: string, 
    projectId: string, 
    embeddingsTable: any,
    topK: number = 10, 
    threshold: number = 0.72
  ): Promise<SimilarityResult[]> {
    console.log(`🔍 Finding similar blocks for ${sourceBlockId} (topK: ${topK}, threshold: ${threshold})`);
    
    // Получаем вектор исходного блока
    const sourceEmbedding = await db
      .select({ vector: embeddingsTable.vector })
      .from(embeddingsTable)
      .where(eq(embeddingsTable.blockId, sourceBlockId))
      .limit(1);

    if (sourceEmbedding.length === 0) {
      console.log('⚠️ Source block embedding not found');
      return [];
    }

    const sourceVector = sourceEmbedding[0].vector as number[];

    // Получаем все эмбеддинги проекта
    const allEmbeddings = await db
      .select({
        blockId: embeddingsTable.blockId,
        vector: embeddingsTable.vector,
        textHash: embeddingsTable.textHash
      })
      .from(embeddingsTable)
      .where(eq(embeddingsTable.projectId, projectId));

    // Вычисляем cosine similarity
    const similarities: SimilarityResult[] = [];
    
    for (const embedding of allEmbeddings) {
      if (embedding.blockId === sourceBlockId) continue; // Пропускаем сам блок
      
      const targetVector = embedding.vector as number[];
      const similarity = this.cosineSimilarity(sourceVector, targetVector);
      
      if (similarity >= threshold) {
        // Вычисляем structural bonus
        const structuralBonus = await this.calculateStructuralBonus(sourceBlockId, embedding.blockId);
        
        // Вычисляем page score (упрощенная версия)
        const pageScore = 0.6 * similarity + 0.3 * similarity + 0.1 * structuralBonus;
        
        similarities.push({
          blockId: embedding.blockId,
          similarity,
          pageScore,
          structuralBonus
        });
      }
    }

    // Сортируем по similarity и берем topK
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Вычисление cosine similarity между двумя векторами
   */
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Вычисление structural bonus
   * PLACEHOLDER: Упрощенная реализация
   */
  private async calculateStructuralBonus(sourceBlockId: string, targetBlockId: string): Promise<number> {
    // В реальной реализации здесь будет проверка:
    // - Общий (под)префикс: +0.02
    // - Общий язык: +0.02  
    // - Целевая = hub/money: +0.02
    
    // Пока возвращаем случайное значение
    return Math.random() * 0.06; // 0-0.06
  }

  /**
   * Добавление задачи в очередь эмбеддингов
   */
  async queueEmbeddingJob(blockIds: string[], projectId: string): Promise<string> {
    const job = await embeddingQueue.add('generate-embeddings', {
      jobId: `embedding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      blockIds,
      batchSize: this.batchConfig.batchSize
    });

    console.log(`📋 Queued embedding job ${job.id} for ${blockIds.length} blocks`);
    return job.id;
  }

  /**
   * Очистка старых эмбеддингов из кэша
   */
  async cleanupOldEmbeddings(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Удаляем старые записи из кэша БД
    await db
      .delete(embeddingCache)
      .where(sql`last_used < ${oneHourAgo}`);
    
    console.log('🧹 Cleaned up old embeddings from cache');
  }

  /**
   * Полная очистка кэша (память + БД)
   */
  clearCache(): void {
    // Очищаем кэш в памяти
    this.lruCache.clear();
    console.log('🧹 [EmbeddingService] Cleared memory cache');
  }

  /**
   * Очистка кэша для конкретного проекта
   */
  async clearProjectCache(projectId: string): Promise<void> {
    // Очищаем кэш в памяти (все записи)
    this.lruCache.clear();
    
    // Очищаем кэш в БД для проекта
    await db
      .delete(embeddingCache)
      .where(eq(embeddingCache.projectId, projectId));
    
    console.log(`🧹 [EmbeddingService] Cleared cache for project: ${projectId}`);
  }
}



