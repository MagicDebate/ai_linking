import { db } from './db';
import { linkCandidates, generationRuns, pageEmbeddings, pagesClean, graphMeta, importJobs, embeddings, blocks, pagesRaw } from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { embeddingService } from './embeddingService';
import { linkGenerationQueue } from './queue';
import OpenAI from 'openai';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Интерфейс параметров генерации (точно по UI)
interface GenerationParams {
  // Лимиты
  maxLinks: number;
  exactAnchorPercent: number;
  
  // Сценарии ON/OFF + настройки
  scenarios: {
    orphanFix: boolean;
    headConsolidation: boolean;
    clusterCrossLink: boolean;
    commercialRouting: boolean;
    depthLift: {
      enabled: boolean;
      minDepth: number; // 3-8
    };
    freshnessPush: {
      enabled: boolean;
      daysFresh: number; // 7-60
      linksPerDonor: number; // 0-3
    };
  };
  
  // Списки страниц
  priorityPages: string[]; // Только для Commercial Routing
  hubPages: string[]; // Только для Head Consolidation
  stopAnchors: string[];
  
  // Каннибализация
  cannibalization: {
    enabled: boolean;
    level: 'low' | 'medium' | 'high'; // 0.3 | 0.5 | 0.7
  };
  
  // Политики ссылок
  policies: {
    oldLinks: 'enrich' | 'regenerate' | 'audit';
    brokenLinks: 'ignore' | 'delete' | 'replace';
    removeDuplicates: boolean;
  };
  
  // HTML атрибуты
  htmlAttributes: {
    cssClass: string;
    targetBlank: boolean;
    rel: {
      noopener: boolean;
      noreferrer: boolean;
      nofollow: boolean;
    };
  };
}

// Кандидат на создание ссылки
interface LinkCandidate {
  sourcePage: any;
  targetPage: any;
  anchorText: string;
  scenario: string;
  relevanceScore: number; // cosine similarity или другая метрика
  freshness?: number; // timestamp для freshness push
}

// Приоритеты сценариев (больше = важнее)
const SCENARIO_PRIORITIES: Record<string, number> = {
  'orphan_fix': 100,           // Высший приоритет - сиротские страницы нужно связать
  'commercial_routing': 90,    // Высокий - деньги важны
  'depth_lift': 80,            // Средне-высокий - глубокие страницы
  'head_consolidation': 70,    // Средний - консолидация хабов
  'freshness_push': 60,        // Средне-низкий - свежий контент
  'cluster_cross_link': 50     // Низкий - перелинковка внутри кластеров
};

// Статистика генерации
interface GenerationStats {
  totalGenerated: number;
  totalRejected: number;
  duplicatesRemoved: number;
  cannibalBlocks: number;
  stopAnchorsApplied: number;
  similarityMatches: number;
  quotaExceeded: number; // Новая метрика
}

export class LinkGenerator {
  private projectId: string;
  private stats: GenerationStats = {
    totalGenerated: 0,
    totalRejected: 0,
    duplicatesRemoved: 0,
    cannibalBlocks: 0,
    stopAnchorsApplied: 0,
    similarityMatches: 0,
    quotaExceeded: 0
  };
  
  // Пул кандидатов для каждой страницы-донора
  private candidatePool: Map<string, LinkCandidate[]> = new Map();

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  // ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ ПО СЦЕНАРИЯМ (для обратной совместимости)
  async generateLinks(params: GenerationParams): Promise<string> {
    const runId = crypto.randomUUID();

    try {
      // Создаем запись о запуске
      await db
        .insert(generationRuns)
        .values({
          runId,
          projectId: this.projectId,
          importId: 'default-import',
          status: 'running',
          phase: 'initialization',
          percent: 0,
          generated: 0,
          rejected: 0
        });

      // Вызываем главную логику
      return await this.generateLinksWithRunId(runId, params);
    } catch (error) {
      console.error('❌ Link generation failed:', error);
      
      // Update run with error status
      await db
        .update(generationRuns)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));
      
      throw error;
    }
  }

  // ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ С ПРЕДОСТАВЛЕННЫМ runId
  async generateLinksWithRunId(runId: string, params: GenerationParams): Promise<string> {
    try {
      // КРИТИЧНО: очищаем пулы перед каждым запуском
      this.candidatePool.clear();
      this.stats = {
        totalGenerated: 0,
        totalRejected: 0,
        duplicatesRemoved: 0,
        cannibalBlocks: 0,
        stopAnchorsApplied: 0,
        similarityMatches: 0,
        quotaExceeded: 0
      };

      console.log('🚀 Starting SPEC-COMPLIANT scenario-based link generation...');
      console.log('📋 Active scenarios:', {
        orphanFix: params.scenarios.orphanFix,
        headConsolidation: params.scenarios.headConsolidation,
        clusterCrossLink: params.scenarios.clusterCrossLink,
        commercialRouting: params.scenarios.commercialRouting,
        depthLift: params.scenarios.depthLift.enabled ? `ON (minDepth: ${params.scenarios.depthLift.minDepth})` : 'OFF',
        freshnessPush: params.scenarios.freshnessPush.enabled ? `ON (${params.scenarios.freshnessPush.daysFresh} days, ${params.scenarios.freshnessPush.linksPerDonor} links)` : 'OFF'
      });
      
      // Apply old links policy before generation
      await this.handleOldLinksPolicy(params.policies.oldLinks, runId);
      
      // Phase 1: Load pages (0-20%)
      await this.updateProgress(runId, 'loading', 10, 0, 0);
      const pages = await this.loadPages();
      await this.updateProgress(runId, 'loading', 20, 0, 0);

      // Phase 2: Execute each scenario independently (20-80%)
      let totalGenerated = 0;
      let totalRejected = 0;
      let progressBase = 20;
      const scenarioCount = Object.values(params.scenarios).filter(s => 
        typeof s === 'boolean' ? s : s.enabled
      ).length;
      const progressPerScenario = 60 / Math.max(scenarioCount, 1);

      // ORPHAN FIX SCENARIO
      if (params.scenarios.orphanFix) {
        console.log('🔗 Executing ORPHAN FIX scenario...');
        const result = await this.executeOrphanFixScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // HEAD CONSOLIDATION SCENARIO
      if (params.scenarios.headConsolidation) {
        console.log('🔗 Executing HEAD CONSOLIDATION scenario...');
        const result = await this.executeHeadConsolidationScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // CLUSTER CROSS-LINK SCENARIO
      if (params.scenarios.clusterCrossLink) {
        console.log('🔗 Executing CLUSTER CROSS-LINK scenario...');
        const result = await this.executeClusterCrossLinkScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // COMMERCIAL ROUTING SCENARIO
      if (params.scenarios.commercialRouting) {
        console.log('🔗 Executing COMMERCIAL ROUTING scenario...');
        const result = await this.executeCommercialRoutingScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // DEPTH LIFT SCENARIO
      if (params.scenarios.depthLift.enabled) {
        console.log('🔗 Executing DEPTH LIFT scenario...');
        const result = await this.executeDepthLiftScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // FRESHNESS PUSH SCENARIO
      if (params.scenarios.freshnessPush.enabled) {
        console.log('🔗 Executing FRESHNESS PUSH scenario...');
        const result = await this.executeFreshnessPushScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected);
      }

      // ФИНАЛЬНЫЙ ОТБОР: применяем maxLinks и приоритизацию (80-90%)
      console.log(`\n🎯 Starting final selection with maxLinks=${params.maxLinks}...`);
      console.log(`📊 Candidate pool size: ${this.candidatePool.size} donors, ${Array.from(this.candidatePool.values()).reduce((sum, arr) => sum + arr.length, 0)} total candidates`);
      
      await this.updateProgress(runId, 'selecting best links', 80, 0, 0);
      
      totalGenerated = 0;
      totalRejected = 0;
      
      // Для каждого донора выбираем лучшие ссылки
      for (const [donorId, candidates] of Array.from(this.candidatePool.entries())) {
        const { selected, rejected } = await this.selectLinksForDonor(
          donorId,
          candidates,
          params.maxLinks,
          params
        );

        // Вставляем выбранные ссылки в БД
        for (const candidate of selected) {
          await db.insert(linkCandidates).values({
            runId: runId,
            sourcePageId: candidate.sourcePage.id,
            targetPageId: candidate.targetPage.id,
            sourceUrl: candidate.sourcePage.url,
            targetUrl: candidate.targetPage.url,
            anchorText: candidate.anchorText,
            scenario: candidate.scenario,
            position: 0, // Will be calculated during HTML insertion
            isRejected: false,
            rejectionReason: null
          });
          totalGenerated++;
        }

        // Вставляем отклоненные ссылки
        for (const { candidate, reason } of rejected) {
          await db.insert(linkCandidates).values({
            runId: runId,
            sourcePageId: candidate.sourcePage.id,
            targetPageId: candidate.targetPage.id,
            sourceUrl: candidate.sourcePage.url,
            targetUrl: candidate.targetPage.url,
            anchorText: candidate.anchorText,
            scenario: candidate.scenario,
            position: 0,
            isRejected: true,
            rejectionReason: reason
          });
          totalRejected++;
        }
      }

      console.log(`✅ Final selection complete: ${totalGenerated} generated, ${totalRejected} rejected`);

      // Final phase (90-100%)
      await this.updateProgress(runId, 'finalizing', 90, totalGenerated, totalRejected);
      
      // Final statistics
      const finalStats = {
        totalGenerated,
        totalRejected,
        duplicatesRemoved: this.stats.duplicatesRemoved,
        cannibalBlocks: this.stats.cannibalBlocks,
        stopAnchorsApplied: this.stats.stopAnchorsApplied,
        similarityMatches: this.stats.similarityMatches
      };

      // Update run with final status
      await db
        .update(generationRuns)
        .set({
          status: 'draft',
          phase: 'completed',
          percent: 100,
          generated: totalGenerated,
          rejected: totalRejected,
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));

      console.log('✅ Link generation completed successfully!');
      console.log('📊 Final statistics:', finalStats);

      return runId;

    } catch (error) {
      console.error('❌ Link generation failed:', error);
      
      // Update run with error status
      await db
        .update(generationRuns)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));
      
      throw error;
    }
  }

  // Добавить кандидата в пул
  private addCandidate(candidate: LinkCandidate) {
    const donorId = candidate.sourcePage.id;
    if (!this.candidatePool.has(donorId)) {
      this.candidatePool.set(donorId, []);
    }
    this.candidatePool.get(donorId)!.push(candidate);
  }

  // ORPHAN FIX: поднимает сиротские страницы
  private async executeOrphanFixScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем сиротские страницы
    const orphanPages = pages.filter(page => page.isOrphan);

    for (const orphanPage of orphanPages) {
      // Ищем похожие страницы через cosine similarity
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(orphanPage, pages, 5, 0.70);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: orphanPage,
          anchorText: '', // Пустой, заполним после отбора
          scenario: 'orphan_fix',
          relevanceScore: score
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // HEAD CONSOLIDATION: консолидирует головные страницы
  private async executeHeadConsolidationScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем hub страницы
    const hubPages = pages.filter(page => params.hubPages.includes(page.url));

    for (const hubPage of hubPages) {
      // Ищем похожие страницы через cosine similarity
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(hubPage, pages, 3, 0.78);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: hubPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'head_consolidation',
          relevanceScore: score
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // CLUSTER CROSS-LINK: создает взаимные ссылки внутри тематических кластеров
  private async executeClusterCrossLinkScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Группируем страницы по семантической близости
    for (let i = 0; i < pages.length; i++) {
      const page1 = pages[i];
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(page1, pages, 3, 0.78);
      
      for (const { page: page2, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: page1,
          targetPage: page2,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'cluster_cross_link',
          relevanceScore: score
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // COMMERCIAL ROUTING: направляет трафик на коммерческие страницы
  private async executeCommercialRoutingScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем money страницы
    const moneyPages = pages.filter(page => params.priorityPages.includes(page.url));

    for (const moneyPage of moneyPages) {
      // Ищем релевантных доноров через cosine similarity (не всех страниц!)
      const potentialDonors = pages.filter(page => !params.priorityPages.includes(page.url));
      const relevantDonorsWithScores = await this.findSimilarPagesByCosineWithScores(moneyPage, potentialDonors, 5, 0.70);
      
      for (const { page: donorPage, score } of relevantDonorsWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: donorPage,
          targetPage: moneyPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'commercial_routing',
          relevanceScore: score
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // DEPTH LIFT: поднимает глубокие страницы
  private async executeDepthLiftScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем глубокие страницы
    const deepPages = pages.filter(page => page.clickDepth >= params.scenarios.depthLift.minDepth);

    for (const deepPage of deepPages) {
      // Ищем похожие страницы с меньшей глубиной
      const shallowPages = pages.filter(page => page.clickDepth < params.scenarios.depthLift.minDepth);
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(deepPage, shallowPages, 3, 0.70);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: deepPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'depth_lift',
          relevanceScore: score
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // FRESHNESS PUSH: продвигает свежие страницы
  private async executeFreshnessPushScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    const daysFresh = params.scenarios.freshnessPush.daysFresh;
    const linksPerDonor = params.scenarios.freshnessPush.linksPerDonor;
    
    // Получаем свежие страницы
    const freshPages = pages.filter(page => {
      const publishedAt = new Date(page.publishedAt || page.createdAt);
      const daysSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePublished <= daysFresh;
    });
      
    for (const freshPage of freshPages) {
      // Ищем релевантных доноров через cosine similarity
      const potentialDonors = pages.filter(page => page.id !== freshPage.id);
      const relevantDonorsWithScores = await this.findSimilarPagesByCosineWithScores(freshPage, potentialDonors, linksPerDonor, 0.65);
      
      // Получаем timestamp свежести
      const freshnessTimestamp = new Date(freshPage.publishedAt || freshPage.createdAt).getTime();
        
      for (const { page: donorPage, score } of relevantDonorsWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: donorPage,
          targetPage: freshPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'freshness_push',
          relevanceScore: score,
          freshness: freshnessTimestamp
        });
      }
    }

    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // НОВЫЙ МЕТОД: Поиск похожих страниц через cosine similarity (с scores)
  private async findSimilarPagesByCosineWithScores(sourcePage: any, allPages: any[], limit: number, threshold: number): Promise<Array<{ page: any, score: number }>> {
    console.log(`🔍 Finding similar pages for ${sourcePage.url} (threshold: ${threshold})`);
    
    // Получаем блоки исходной страницы
    const sourceBlocks = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.pageId, sourcePage.id));

    if (sourceBlocks.length === 0) {
      console.log('⚠️ No blocks found for source page');
      return [];
    }

    const similarities: Array<{ page: any, score: number }> = [];

    // Для каждого блока исходной страницы ищем похожие блоки
    for (const sourceBlock of sourceBlocks) {
      const similarBlocks = await embeddingService.findSimilarBlocks(
        sourceBlock.id,
        this.projectId,
        10, // topK
        threshold
      );

      // Группируем результаты по страницам
      for (const similarBlock of similarBlocks) {
        // Получаем pageId из blockId
        const targetBlock = await db
          .select({ pageId: blocks.pageId })
          .from(blocks)
          .where(eq(blocks.id, similarBlock.blockId))
          .limit(1);
        
        if (targetBlock.length > 0) {
          const targetPage = allPages.find(p => p.id === targetBlock[0].pageId);
          if (targetPage && targetPage.id !== sourcePage.id) {
            const existing = similarities.find(s => s.page.id === targetPage.id);
            if (existing) {
              existing.score = Math.max(existing.score, similarBlock.pageScore);
            } else {
              similarities.push({
                page: targetPage,
                score: similarBlock.pageScore
              });
            }
          }
        }
      }
    }

    // Сортируем по score и берем top limit
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Поиск похожих страниц (без scores для обратной совместимости)
  private async findSimilarPagesByCosine(sourcePage: any, allPages: any[], limit: number, threshold: number): Promise<any[]> {
    const results = await this.findSimilarPagesByCosineWithScores(sourcePage, allPages, limit, threshold);
    return results.map(r => r.page);
  }

  // Поиск естественного анкора в контенте исходной страницы
  private async findNaturalAnchor(sourcePage: any, targetPage: any): Promise<string | null> {
    try {
      // Получаем контент исходной страницы
      const sourceContent = await db
        .select({
          content: sql<string>`COALESCE(${pagesRaw.meta}->>'content', ${pagesRaw.meta}->>'post_content', ${pagesRaw.rawHtml}, '')`
        })
        .from(pagesRaw)
        .where(eq(pagesRaw.url, sourcePage.url))
        .limit(1);

      if (sourceContent.length === 0 || !sourceContent[0].content) return null;

      const content = sourceContent[0].content;
      const targetTitle = targetPage.title || '';
      const targetKeywords = targetTitle.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

      // Ищем предложения, содержащие ключевые слова целевой страницы
      const sentences = content.split(/[.!?]\s+/);
      
      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        const matchCount = targetKeywords.filter((kw: string) => lowerSentence.includes(kw)).length;
        
        // Если найдено 2+ ключевых слова, извлекаем фразу
        if (matchCount >= 2) {
          const words = sentence.split(/\s+/);
          // Берем 3-7 слов как естественный анкор
          const anchorLength = Math.min(7, Math.max(3, words.length / 2));
          const naturalAnchor = words.slice(0, anchorLength).join(' ');
          
          if (naturalAnchor.length > 10 && naturalAnchor.length < 100) {
            return naturalAnchor.trim();
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding natural anchor:', error);
      return null;
    }
  }

  // Рерайт предложения через OpenAI для встраивания анкора
  private async rewriteSentenceWithOpenAI(sourcePage: any, targetPage: any, params: GenerationParams): Promise<{ anchor: string, modifiedSentence: string }> {
    try {
      // Получаем контент исходной страницы
      const sourceContent = await db
        .select({
          content: sql<string>`COALESCE(${pagesRaw.meta}->>'content', ${pagesRaw.meta}->>'post_content', ${pagesRaw.rawHtml}, '')`
        })
        .from(pagesRaw)
        .where(eq(pagesRaw.url, sourcePage.url))
        .limit(1);

      if (sourceContent.length === 0) {
        return { anchor: targetPage.title || 'читать далее', modifiedSentence: '' };
      }

      const content = sourceContent[0].content;
      const sentences = content.split(/[.!?]\s+/).filter((s: string) => s.length > 20);
      const randomSentence = sentences[Math.floor(Math.random() * Math.min(10, sentences.length))] || content.substring(0, 200);

      const targetTitle = targetPage.title || targetPage.url;
      const exactPercent = params.exactAnchorPercent || 20;
      const useExact = Math.random() * 100 < exactPercent;

      const prompt = useExact
        ? `Перепиши следующее предложение так, чтобы в него естественно встроилась фраза "${targetTitle}". Верни JSON:
        {"anchor": "точная фраза для анкора", "sentence": "переписанное предложение с вставленной фразой"}
        
        Исходное предложение: "${randomSentence}"`
        : `Перепиши следующее предложение так, чтобы в него естественно встроилась ссылка на тему "${targetTitle}". Создай подходящий анкорный текст (не точное совпадение). Верни JSON:
        {"anchor": "анкорный текст", "sentence": "переписанное предложение"}
        
        Исходное предложение: "${randomSentence}"`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: "Ты SEO-эксперт. Создаешь естественные анкорные тексты для внутренних ссылок." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 256
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        anchor: result.anchor || targetTitle,
        modifiedSentence: result.sentence || randomSentence
      };
    } catch (error) {
      console.error('OpenAI rewrite error:', error);
      // Fallback к простому анкору
      return {
        anchor: targetPage.title || 'узнать больше',
        modifiedSentence: ''
      };
    }
  }

  // Отбор лучших ссылок для одного донора с учетом maxLinks
  private async selectLinksForDonor(
    donorId: string,
    candidates: LinkCandidate[],
    maxLinks: number,
    params: GenerationParams
  ): Promise<{ selected: LinkCandidate[], rejected: Array<{candidate: LinkCandidate, reason: string}> }> {
    const selected: LinkCandidate[] = [];
    const rejected: Array<{candidate: LinkCandidate, reason: string}> = [];

    // Фильтрация по политикам (дубликаты, каннибализация, стоп-анкоры)
    const filtered: LinkCandidate[] = [];
    for (const candidate of candidates) {
      // Проверка self-link
      if (candidate.sourcePage.id === candidate.targetPage.id) {
        rejected.push({ candidate, reason: 'Self-link not allowed' });
        continue;
      }

      // Проверка дубликатов
      if (params.policies.removeDuplicates) {
        const isDuplicate = await this.isDuplicateLink(candidate.sourcePage.url, candidate.targetPage.url);
        if (isDuplicate) {
          this.stats.duplicatesRemoved++;
          rejected.push({ candidate, reason: 'Duplicate link removed' });
          continue;
        }
      }

      // Проверка каннибализации
      const isCannibal = await this.checkCannibalization(candidate.sourcePage.url, candidate.targetPage.url, params);
      if (isCannibal) {
        this.stats.cannibalBlocks++;
        rejected.push({ candidate, reason: 'Cannibalization blocked' });
        continue;
      }

      // НЕ проверяем стоп-анкоры здесь, т.к. anchorText пустой
      // Проверка будет после генерации

      filtered.push(candidate);
    }

    // Ранжирование: приоритет сценария > релевантность > свежесть
    const ranked = filtered.sort((a, b) => {
      // 1. Приоритет сценария (больше = важнее)
      const priorityDiff = (SCENARIO_PRIORITIES[b.scenario] || 0) - (SCENARIO_PRIORITIES[a.scenario] || 0);
      if (priorityDiff !== 0) return priorityDiff;

      // 2. Релевантность (больше = лучше)
      const relevanceDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(relevanceDiff) > 0.01) return relevanceDiff;

      // 3. Свежесть (новее = лучше)
      if (a.freshness && b.freshness) {
        return b.freshness - a.freshness;
      }

      return 0;
    });

    // Выбираем топ-N и ГЕНЕРИРУЕМ АНКОРЫ ТОЛЬКО ДЛЯ НИХ (экономия токенов!)
    for (let i = 0; i < ranked.length; i++) {
      if (i < maxLinks) {
        const candidate = ranked[i];
        
        // Генерация анкора: сначала ищем естественный, потом рерайт через OpenAI
        let anchor = await this.findNaturalAnchor(candidate.sourcePage, candidate.targetPage);
        let modifiedSentence = '';
        
        if (!anchor) {
          const result = await this.rewriteSentenceWithOpenAI(candidate.sourcePage, candidate.targetPage, params);
          anchor = result.anchor;
          modifiedSentence = result.modifiedSentence;
        }

        // Проверка стоп-листа ПОСЛЕ генерации
        if (this.isStopAnchor(anchor, params.stopAnchors)) {
          this.stats.stopAnchorsApplied++;
          anchor = 'подробнее'; // Generic fallback
        }

        candidate.anchorText = anchor;
        selected.push(candidate);
      } else {
        this.stats.quotaExceeded++;
        rejected.push({ candidate: ranked[i], reason: 'Quota exceeded (maxLinks)' });
      }
    }

    return { selected, rejected };
  }

  // Попытка создать ссылку с проверкой всех политик
  private async tryCreateLink(runId: string, sourcePage: any, targetPage: any, scenario: string, params: GenerationParams): Promise<{ created: boolean, reason?: string, anchor?: string }> {
    try {
      // 1. Базовые проверки
      if (sourcePage.id === targetPage.id) {
        return { created: false, reason: 'Self-link not allowed' };
      }

      // 2. Проверка дубликатов
      if (params.policies.removeDuplicates) {
        const isDuplicate = await this.isDuplicateLink(sourcePage.url, targetPage.url);
        if (isDuplicate) {
          this.stats.duplicatesRemoved++;
          return { created: false, reason: 'Duplicate link removed' };
        }
      }

      // 3. Проверка каннибализации
      const isCannibal = await this.checkCannibalization(sourcePage.url, targetPage.url, params);
      if (isCannibal) {
        return { created: false, reason: 'Cannibalization blocked' };
      }

      // 4. Генерация анкора
      const anchorText = await this.generateAnchorText(sourcePage, targetPage, params);
      
      // 5. Проверка стоп-листа
      if (this.isStopAnchor(anchorText, params.stopAnchors)) {
        this.stats.stopAnchorsApplied++;
        return { created: false, reason: 'Anchor in stop list' };
      }

      // 6. Создание ссылки в БД
      await db.insert(linkCandidates).values({
        runId: runId,
        sourcePageId: sourcePage.id,
        targetPageId: targetPage.id,
        sourceUrl: sourcePage.url,
        targetUrl: targetPage.url,
        anchorText: anchorText,
        scenario: scenario,
        position: 0, // Position will be calculated during HTML insertion
        isRejected: false,
        rejectionReason: null
      });

      return { created: true, anchor: anchorText };

    } catch (error) {
      console.error('Error creating link:', error);
      return { created: false, reason: 'Database error' };
    }
  }

  // Обновление прогресса генерации
  private async updateProgress(runId: string, phase: string, percent: number, generated: number, rejected: number) {
    await db
      .update(generationRuns)
      .set({
        phase,
        percent,
        generated,
        rejected
      })
      .where(eq(generationRuns.runId, runId));
  }

  // Загрузка страниц проекта
  private async loadPages(): Promise<any[]> {
    const pages = await db
      .select({
        id: pagesClean.id,
        url: pagesRaw.url,
        title: pagesRaw.meta,
        wordCount: pagesClean.wordCount,
        clickDepth: graphMeta.clickDepth,
        inDegree: graphMeta.inDegree,
        outDegree: graphMeta.outDegree,
        isOrphan: graphMeta.isOrphan,
        publishedAt: pagesRaw.createdAt,
        createdAt: pagesClean.createdAt
      })
      .from(pagesClean)
      .innerJoin(pagesRaw, eq(pagesClean.pageRawId, pagesRaw.id))
      .leftJoin(graphMeta, eq(pagesClean.id, graphMeta.pageId))
      .where(eq(pagesRaw.jobId, 'default-job')); // Упрощенно

    return pages;
  }

  // Обработка политики старых ссылок
  private async handleOldLinksPolicy(policy: string, runId: string): Promise<void> {
    // PLACEHOLDER: Реализация политики старых ссылок
    console.log(`📋 Applying old links policy: ${policy}`);
  }

  // Проверка дубликатов ссылок
  private async isDuplicateLink(sourceUrl: string, targetUrl: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(linkCandidates)
      .where(
        and(
          eq(linkCandidates.sourceUrl, sourceUrl),
          eq(linkCandidates.targetUrl, targetUrl)
        )
      )
      .limit(1);

    return existing.length > 0;
  }

  // Проверка каннибализации
  private async checkCannibalization(sourceUrl: string, targetUrl: string, params: GenerationParams): Promise<boolean> {
    if (params.cannibalization.enabled) {
      const threshold = { low: 0.3, medium: 0.5, high: 0.7 }[params.cannibalization.level];
      const similarity = 0.4; // Заглушка
      
      if (similarity > threshold) {
        this.stats.cannibalBlocks++;
        return true;
      }
    }
    return false;
  }

  // Генерация текста анкора
  private async generateAnchorText(sourcePage: any, targetPage: any, params: GenerationParams): Promise<string> {
    // PLACEHOLDER: Реализация генерации анкора
    return `Ссылка на ${targetPage.title || targetPage.url}`;
  }

  // Проверка стоп-листа анкоров
  private isStopAnchor(anchorText: string, stopAnchors: string[]): boolean {
    const lowerAnchor = anchorText.toLowerCase();
    return stopAnchors.some(stop => lowerAnchor.includes(stop.toLowerCase()));
  }

  // Добавление задачи в очередь генерации ссылок
  async queueLinkGeneration(params: GenerationParams): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job = await linkGenerationQueue.add('generate-links', {
      runId,
      projectId: this.projectId,
      scenarios: params.scenarios,
      rules: {
        maxLinks: params.maxLinks,
        exactAnchorPercent: params.exactAnchorPercent
      },
      scope: {
        projectId: this.projectId
      }
    });

    console.log(`📋 Queued link generation job ${job.id} with runId ${runId}`);
    return runId;
  }
}
