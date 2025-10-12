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
  minDistance: number; // Минимальное расстояние между ссылками в словах (50-500)
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
  sourceBlockId?: string; // ID блока, откуда идет ссылка (для проверки дубликатов в блоке)
  anchorText: string;
  scenario: string;
  relevanceScore: number; // cosine similarity или другая метрика
  freshness?: number; // timestamp для freshness push
  originalSentence?: string; // Исходное предложение (для natural anchor)
  modifiedSentence?: string; // Переписанное предложение (для OpenAI rewrite)
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
  private jobId: string | null = null; // НОВОЕ: для фильтрации блоков по импорту
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
      
      // ОПТИМИЗАЦИЯ: загружаем все существующие ссылки ОДИН РАЗ
      const existingLinks = await db
        .select({ sourceUrl: linkCandidates.sourceUrl, targetUrl: linkCandidates.targetUrl })
        .from(linkCandidates)
        .where(eq(linkCandidates.runId, runId));
      
      const existingLinksSet = new Set(existingLinks.map(l => `${l.sourceUrl}→${l.targetUrl}`));
      console.log(`📋 Loaded ${existingLinksSet.size} existing links for duplicate check`);
      
      totalGenerated = 0;
      totalRejected = 0;
      
      // Для каждого донора выбираем лучшие ссылки
      for (const [donorId, candidates] of Array.from(this.candidatePool.entries())) {
        const { selected, rejected } = await this.selectLinksForDonor(
          donorId,
          candidates,
          params.maxLinks,
          params,
          runId,
          existingLinksSet
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
            originalSentence: candidate.originalSentence || null,
            modifiedSentence: candidate.modifiedSentence || null,
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
            originalSentence: candidate.originalSentence || null,
            modifiedSentence: candidate.modifiedSentence || null,
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
    console.log(`📋 ORPHAN FIX: Found ${orphanPages.length} orphan pages to process`);

    let totalCandidates = 0;
    for (const orphanPage of orphanPages) {
      // Ищем похожие страницы через cosine similarity
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(orphanPage, pages, 5, 0.70);
      console.log(`  ├─ ${orphanPage.url}: found ${similarPagesWithScores.length} similar pages (threshold: 0.70)`);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: orphanPage,
          anchorText: '', // Пустой, заполним после отбора
          scenario: 'orphan_fix',
          relevanceScore: score
        });
        totalCandidates++;
      }
    }

    console.log(`✅ ORPHAN FIX complete: ${totalCandidates} candidates added to pool\n`);
    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // HEAD CONSOLIDATION: консолидирует головные страницы
  private async executeHeadConsolidationScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем hub страницы
    const hubPages = pages.filter(page => params.hubPages.includes(page.url));
    console.log(`📋 HEAD CONSOLIDATION: Found ${hubPages.length} hub pages to process`);

    if (hubPages.length === 0) {
      console.log(`⚠️ HEAD CONSOLIDATION skipped: no hub pages configured\n`);
      return { generated: 0, rejected: 0 };
    }

    let totalCandidates = 0;
    for (const hubPage of hubPages) {
      // Ищем похожие страницы через cosine similarity
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(hubPage, pages, 3, 0.78);
      console.log(`  ├─ ${hubPage.url}: found ${similarPagesWithScores.length} similar pages (threshold: 0.78)`);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: hubPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'head_consolidation',
          relevanceScore: score
        });
        totalCandidates++;
      }
    }

    console.log(`✅ HEAD CONSOLIDATION complete: ${totalCandidates} candidates added to pool\n`);
    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // CLUSTER CROSS-LINK: создает взаимные ссылки внутри тематических кластеров
  private async executeClusterCrossLinkScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log(`📋 CLUSTER CROSS-LINK: Processing ${pages.length} pages to find semantic clusters`);
    
    let totalCandidates = 0;
    let processedPages = 0;
    
    // Группируем страницы по семантической близости
    for (let i = 0; i < pages.length; i++) {
      const page1 = pages[i];
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(page1, pages, 3, 0.78);
      
      processedPages++;
      if (processedPages % 5 === 0 || processedPages === pages.length) {
        console.log(`  ├─ Progress: ${processedPages}/${pages.length} pages processed, ${totalCandidates} candidates so far`);
      }
      
      for (const { page: page2, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: page1,
          targetPage: page2,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'cluster_cross_link',
          relevanceScore: score
        });
        totalCandidates++;
      }
    }

    console.log(`✅ CLUSTER CROSS-LINK complete: ${totalCandidates} candidates added to pool\n`);
    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // COMMERCIAL ROUTING: направляет трафик на коммерческие страницы
  private async executeCommercialRoutingScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем money страницы
    const moneyPages = pages.filter(page => params.priorityPages.includes(page.url));
    console.log(`📋 COMMERCIAL ROUTING: Found ${moneyPages.length} priority/money pages to process`);

    if (moneyPages.length === 0) {
      console.log(`⚠️ COMMERCIAL ROUTING skipped: no priority pages configured\n`);
      return { generated: 0, rejected: 0 };
    }

    let totalCandidates = 0;
    for (const moneyPage of moneyPages) {
      // Ищем релевантных доноров через cosine similarity (не всех страниц!)
      const potentialDonors = pages.filter(page => !params.priorityPages.includes(page.url));
      const relevantDonorsWithScores = await this.findSimilarPagesByCosineWithScores(moneyPage, potentialDonors, 5, 0.70);
      console.log(`  ├─ ${moneyPage.url}: found ${relevantDonorsWithScores.length} relevant donors (threshold: 0.70)`);
      
      for (const { page: donorPage, score } of relevantDonorsWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: donorPage,
          targetPage: moneyPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'commercial_routing',
          relevanceScore: score
        });
        totalCandidates++;
      }
    }

    console.log(`✅ COMMERCIAL ROUTING complete: ${totalCandidates} candidates added to pool\n`);
    return { generated: 0, rejected: 0 }; // Счетчики будут обновлены после финального отбора
  }

  // DEPTH LIFT: поднимает глубокие страницы
  private async executeDepthLiftScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Получаем глубокие страницы
    const deepPages = pages.filter(page => page.clickDepth >= params.scenarios.depthLift.minDepth);
    console.log(`📋 DEPTH LIFT: Found ${deepPages.length} deep pages (depth >= ${params.scenarios.depthLift.minDepth})`);

    if (deepPages.length === 0) {
      console.log(`⚠️ DEPTH LIFT skipped: no pages with depth >= ${params.scenarios.depthLift.minDepth}\n`);
      return { generated: 0, rejected: 0 };
    }

    let totalCandidates = 0;
    for (const deepPage of deepPages) {
      // Ищем похожие страницы с меньшей глубиной
      const shallowPages = pages.filter(page => page.clickDepth < params.scenarios.depthLift.minDepth);
      const similarPagesWithScores = await this.findSimilarPagesByCosineWithScores(deepPage, shallowPages, 3, 0.70);
      console.log(`  ├─ ${deepPage.url}: found ${similarPagesWithScores.length} shallow donors (threshold: 0.70)`);
      
      for (const { page: similarPage, score } of similarPagesWithScores) {
        // НЕ генерируем анкор здесь - только после отбора топ-N!
        this.addCandidate({
          sourcePage: similarPage,
          targetPage: deepPage,
          anchorText: '', // Заполним после отбора топ-N
          scenario: 'depth_lift',
          relevanceScore: score
        });
        totalCandidates++;
      }
    }

    console.log(`✅ DEPTH LIFT complete: ${totalCandidates} candidates added to pool\n`);

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
    
    console.log(`📋 FRESHNESS PUSH: Found ${freshPages.length} fresh pages (published within ${daysFresh} days)`);

    if (freshPages.length === 0) {
      console.log(`⚠️ FRESHNESS PUSH skipped: no fresh pages within ${daysFresh} days\n`);
      return { generated: 0, rejected: 0 };
    }

    let totalCandidates = 0;
    for (const freshPage of freshPages) {
      // Ищем релевантных доноров через cosine similarity
      const potentialDonors = pages.filter(page => page.id !== freshPage.id);
      const relevantDonorsWithScores = await this.findSimilarPagesByCosineWithScores(freshPage, potentialDonors, linksPerDonor, 0.65);
      console.log(`  ├─ ${freshPage.url}: found ${relevantDonorsWithScores.length} relevant donors (threshold: 0.65)`);
      
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
        totalCandidates++;
      }
    }

    console.log(`✅ FRESHNESS PUSH complete: ${totalCandidates} candidates added to pool\n`);
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
    let totalBlocksFound = 0;
    let pagesMatched = 0;
    let pagesNotFound = 0;

    // Для каждого блока исходной страницы ищем похожие блоки
    for (const sourceBlock of sourceBlocks) {
      const similarBlocks = await embeddingService.findSimilarBlocks(
        sourceBlock.id,
        this.projectId,
        this.jobId, // ПЕРЕДАЕМ jobId для фильтрации!
        10, // topK
        threshold
      );

      totalBlocksFound += similarBlocks.length;

      // Группируем результаты по страницам
      for (const similarBlock of similarBlocks) {
        // Получаем pageId из blockId
        const targetBlock = await db
          .select({ pageId: blocks.pageId })
          .from(blocks)
          .where(eq(blocks.id, similarBlock.blockId))
          .limit(1);
        
        if (targetBlock.length > 0) {
          const targetPageId = targetBlock[0].pageId;
          const targetPage = allPages.find(p => p.id === targetPageId);
          
          if (targetPage && targetPage.id !== sourcePage.id) {
            pagesMatched++;
            const existing = similarities.find(s => s.page.id === targetPage.id);
            if (existing) {
              existing.score = Math.max(existing.score, similarBlock.pageScore);
            } else {
              similarities.push({
                page: targetPage,
                score: similarBlock.pageScore
              });
            }
          } else if (!targetPage) {
            pagesNotFound++;
          }
        }
      }
    }

    console.log(`  ├─ Blocks analysis: ${totalBlocksFound} similar blocks found → ${pagesMatched} page matches, ${pagesNotFound} pages not in allPages`);
    console.log(`  ├─ Unique pages found: ${similarities.length}`);

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

  // Генерация анкора и предложения через OpenAI (дешевая модель для валидации)
  private async generateAnchorWithOpenAI(sourcePage: any, targetPage: any, params: GenerationParams): Promise<{ anchor: string, modifiedSentence: string, originalSentence: string }> {
    try {
      // Получаем контент исходной страницы
      const sourceContent = await db
        .select({
          content: sql<string>`COALESCE(${pagesRaw.meta}->>'content', ${pagesRaw.meta}->>'post_content', ${pagesRaw.rawHtml}, '')`
        })
        .from(pagesRaw)
        .where(eq(pagesRaw.url, sourcePage.url))
        .limit(1);

      if (sourceContent.length === 0 || !sourceContent[0].content) {
        return { anchor: '', modifiedSentence: '', originalSentence: '' };
      }

      const content = sourceContent[0].content;
      const targetTitle = targetPage.title || targetPage.url;
      
      // Извлекаем чистый текст без HTML
      const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Берем первые 1500 символов для экономии токенов
      const contentSnippet = cleanContent.substring(0, 1500);
      
      const exactPercent = params.exactAnchorPercent || 20;
      const useExact = Math.random() * 100 < exactPercent;

      const prompt = useExact
        ? `Контент: ${contentSnippet}

Тема ссылки: "${targetTitle}"

Задача: выбери существующую фразу ИЛИ перепиши предложение, чтобы встроить точный анкор "${targetTitle}".

Требования:
- Анкор: ТОЧНО "${targetTitle}"
- Анкор 2-4 слова, БЕЗ предлогов/частиц в начале
- Предложение читается естественно
- Если невозможно - верни null

JSON: {"anchor": "текст анкора", "sentence": "предложение с [ANCHOR]анкор[/ANCHOR]"} или null`
        : `Контент: ${contentSnippet}

Тема ссылки: "${targetTitle}"

Задача: выбери подходящую фразу ИЛИ перепиши предложение для естественной ссылки.

Требования:
- Анкор 2-4 слова, релевантен "${targetTitle}"
- БЕЗ предлогов (в, на, с, к, по, от, для, же, ли, бы и т.д.)
- БЕЗ generic ("подробнее", "узнать", "читать")
- Предложение с [ANCHOR]анкор[/ANCHOR]
- Если невозможно - верни null

JSON: {"anchor": "текст", "sentence": "предложение с [ANCHOR]анкор[/ANCHOR]"} или null`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Дешевая модель для валидации
        messages: [
          { role: "system", content: "SEO-специалист. Создаёшь ТОЛЬКО качественные анкоры 2-4 слова. Если невозможно - возвращай null." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 200, // Экономия токенов
        temperature: 0.3 // Более предсказуемый результат
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Валидация: anchor и sentence должны быть строками
      if (!result || 
          typeof result.anchor !== 'string' || 
          typeof result.sentence !== 'string' ||
          !result.anchor.trim() || 
          !result.sentence.trim()) {
        console.log(`⚠️ OpenAI returned invalid format for "${targetTitle}":`, result);
        return { anchor: '', modifiedSentence: '', originalSentence: '' };
      }
      
      // Извлекаем оригинальное предложение из контента
      const sentences = cleanContent.split(/[.!?]\s+/).filter(s => s.length > 20);
      const originalSentence = sentences[0] || '';
      
      return {
        anchor: result.anchor.trim(),
        modifiedSentence: result.sentence.trim(),
        originalSentence
      };
    } catch (error) {
      console.error('OpenAI anchor generation error:', error);
      return { anchor: '', modifiedSentence: '', originalSentence: '' };
    }
  }


  // Простая проверка: один блок = максимум одна ссылка
  // Разбиваем контент на блоки и отслеживаем использованные
  private extractContentBlocks(content: string): { text: string; position: number }[] {
    // Убираем HTML теги
    const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Разбиваем на предложения (блоки)
    const sentences = cleanContent.split(/[.!?]\s+/).filter(s => s.length > 20);
    
    let currentPosition = 0;
    return sentences.map(sentence => {
      const block = {
        text: sentence,
        position: currentPosition
      };
      currentPosition += sentence.length;
      return block;
    });
  }

  // Находим индекс блока в котором находится anchor
  private findBlockIndex(blocks: { text: string; position: number }[], anchor: string): number {
    return blocks.findIndex(block => block.text.includes(anchor));
  }

  // Отбор лучших ссылок для одного донора с учетом maxLinks
  private async selectLinksForDonor(
    donorId: string,
    candidates: LinkCandidate[],
    maxLinks: number,
    params: GenerationParams,
    runId: string,
    existingLinksSet: Set<string>
  ): Promise<{ selected: LinkCandidate[], rejected: Array<{candidate: LinkCandidate, reason: string}> }> {
    const selected: LinkCandidate[] = [];
    const usedBlockIndices = new Set<number>(); // Отслеживаем использованные блоки
    const rejected: Array<{candidate: LinkCandidate, reason: string}> = [];
    
    // Получаем контент донора и разбиваем на блоки
    const donorContent = candidates[0]?.sourcePage?.content || '';
    const contentBlocks = this.extractContentBlocks(donorContent);

    // Фильтрация по политикам (дубликаты, каннибализация, стоп-анкоры)
    const filtered: LinkCandidate[] = [];
    for (const candidate of candidates) {
      // Проверка self-link
      if (candidate.sourcePage.id === candidate.targetPage.id) {
        rejected.push({ candidate, reason: 'Self-link not allowed' });
        continue;
      }

      // Проверка дубликатов (ОПТИМИЗИРОВАНО: используем Set вместо БД)
      const linkKey = `${candidate.sourcePage.url}→${candidate.targetPage.url}`;
      const isDuplicate = existingLinksSet.has(linkKey);
      if (isDuplicate) {
        this.stats.duplicatesRemoved++;
        rejected.push({ candidate, reason: 'Duplicate link: same source→target already exists' });
        continue;
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
    for (let i = 0; i < ranked.length && selected.length < maxLinks; i++) {
      const candidate = ranked[i];
      
      // Генерация анкора через OpenAI (дешевая модель gpt-4o-mini)
      const result = await this.generateAnchorWithOpenAI(candidate.sourcePage, candidate.targetPage, params);
      let anchor = result.anchor;
      const modifiedSentence = result.modifiedSentence;
      const originalSentence = result.originalSentence;

      // КРИТИЧНО: Если не удалось создать нормальный анкор - ПРОПУСКАЕМ эту ссылку!
      // Дополнительная валидация - если anchor это объект, приводим к строке или отклоняем
      if (typeof anchor === 'object' && anchor !== null) {
        console.log(`⚠️ OpenAI returned object instead of string:`, anchor);
        rejected.push({ candidate, reason: 'Anchor is object, not string' });
        continue;
      }
      
      if (!anchor || typeof anchor !== 'string' || anchor.length < 2) {
        rejected.push({ candidate, reason: 'Failed to generate natural anchor' });
        console.log(`⚠️ Skipping link: no natural anchor could be generated (type: ${typeof anchor})`);
        continue;
      }

      // Проверка стоп-листа ПОСЛЕ генерации
      if (this.isStopAnchor(anchor, params.stopAnchors)) {
        this.stats.stopAnchorsApplied++;
        rejected.push({ candidate, reason: 'Anchor in stop-list, no alternative found' });
        console.log(`⚠️ Skipping link: anchor "${anchor}" in stop-list`);
        continue;
      }

      // Проверка длины анкора (2-50 символов для естественности)
      if (anchor.length > 50) {
        rejected.push({ candidate, reason: 'Anchor too long (>50 chars)' });
        console.log(`⚠️ Skipping link: anchor too long "${anchor.substring(0, 30)}..."`);
        continue;
      }

      // Простая проверка: один блок = максимум одна ссылка
      // Ищем блок где находится anchor (сам якорный текст)
      let blockIndex = this.findBlockIndex(contentBlocks, anchor);
      console.log(`🔍 Searching for anchor "${anchor}" in ${contentBlocks.length} blocks → index ${blockIndex}`);
      
      // Если не найден - пытаемся найти по ключевым словам
      if (blockIndex < 0) {
        // Извлекаем ключевые слова из anchor (убираем предлоги и короткие слова)
        const keywords = anchor.split(/\s+/).filter(w => w.length > 3);
        if (keywords.length > 0) {
          const mainKeyword = keywords[0]; // Берем первое значимое слово
          blockIndex = this.findBlockIndex(contentBlocks, mainKeyword);
          console.log(`📝 Anchor not found, searching by keyword "${mainKeyword}" → block ${blockIndex}`);
        }
      }
      
      // Если все еще не найден - отклоняем (не можем определить блок)
      if (blockIndex < 0) {
        rejected.push({ candidate, reason: `Cannot find content block containing anchor "${anchor}"` });
        console.log(`⚠️ Skipping link: cannot find block for anchor "${anchor}"`);
        continue;
      }
      
      // Проверяем - не использован ли уже этот блок?
      if (usedBlockIndices.has(blockIndex)) {
        rejected.push({ candidate, reason: `Block already used (one block = one link max)` });
        console.log(`⚠️ Skipping link: block ${blockIndex} already has a link`);
        continue;
      }
      
      // Помечаем блок как использованный
      usedBlockIndices.add(blockIndex);
      console.log(`✓ Block ${blockIndex} marked as used`);

      // Всё ОК - добавляем ссылку!
      candidate.anchorText = anchor;
      candidate.originalSentence = originalSentence;
      candidate.modifiedSentence = modifiedSentence;
      selected.push(candidate);
      
      console.log(`✅ Link selected: "${anchor}" (${candidate.scenario})`);
      
      // Добавляем в Set ВСЕГДА - блокируем дубликаты source→target
      const linkKey = `${candidate.sourcePage.url}→${candidate.targetPage.url}`;
      existingLinksSet.add(linkKey);
    }
    
    // Отклоняем остальные по квоте
    for (let i = ranked.length; i < candidates.length; i++) {
      this.stats.quotaExceeded++;
      rejected.push({ candidate: ranked[i], reason: 'Quota exceeded (maxLinks)' });
    }

    return { selected, rejected };
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
    // Получаем последний jobId для этого проекта
    const latestJob = await db
      .select({ jobId: importJobs.jobId })
      .from(importJobs)
      .where(eq(importJobs.projectId, this.projectId))
      .orderBy(desc(importJobs.startedAt))
      .limit(1);

    if (!latestJob.length) {
      console.warn(`⚠️ No import jobs found for project ${this.projectId}`);
      return [];
    }

    this.jobId = latestJob[0].jobId; // СОХРАНЯЕМ jobId для фильтрации блоков
    console.log(`📋 Using jobId: ${this.jobId} for link generation`);

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
      .where(eq(pagesRaw.jobId, this.jobId));

    return pages;
  }

  // Обработка политики старых ссылок
  private async handleOldLinksPolicy(policy: string, runId: string): Promise<void> {
    if (policy === 'audit') {
      // Audit - только проверка, не изменяем существующие ссылки
      console.log(`📋 Audit mode: analyzing links without modifications`);
      return;
    }

    if (policy === 'regenerate') {
      // Regenerate - удаляем все старые ссылки для этого запуска и создаем новые
      const deletedCount = await db
        .delete(linkCandidates)
        .where(eq(linkCandidates.runId, runId));
      console.log(`📋 Regenerated links: deleted ${deletedCount} old links`);
      return;
    }

    if (policy === 'enrich') {
      // Enrich - оставляем старые и добавляем новые
      console.log(`📋 Enriching: keeping existing links and adding new ones`);
      return;
    }

    console.warn(`⚠️ Unknown old links policy: ${policy}, defaulting to 'enrich'`);
  }

  // Проверка дубликатов ссылок (только внутри текущей генерации)
  private async isDuplicateLink(sourceUrl: string, targetUrl: string, runId: string): Promise<boolean> {
    const existing = await db
      .select()
      .from(linkCandidates)
      .where(
        and(
          eq(linkCandidates.runId, runId),
          eq(linkCandidates.sourceUrl, sourceUrl),
          eq(linkCandidates.targetUrl, targetUrl)
        )
      )
      .limit(1);

    return existing.length > 0;
  }

  // Проверка каннибализации через реальную семантическую схожесть
  private async checkCannibalization(sourceUrl: string, targetUrl: string, params: GenerationParams): Promise<boolean> {
    if (!params.cannibalization.enabled) {
      return false;
    }

    try {
      const threshold = { low: 0.3, medium: 0.5, high: 0.7 }[params.cannibalization.level];
      
      // Получаем средние эмбеддинги для обеих страниц через блоки
      const sourceBlocks = await db
        .select({ vector: embeddings.vector })
        .from(blocks)
        .innerJoin(pagesRaw, eq(blocks.pageId, pagesRaw.id))
        .innerJoin(embeddings, eq(blocks.id, embeddings.blockId))
        .where(eq(pagesRaw.url, sourceUrl))
        .limit(5); // Берем первые 5 блоков для оценки

      const targetBlocks = await db
        .select({ vector: embeddings.vector })
        .from(blocks)
        .innerJoin(pagesRaw, eq(blocks.pageId, pagesRaw.id))
        .innerJoin(embeddings, eq(blocks.id, embeddings.blockId))
        .where(eq(pagesRaw.url, targetUrl))
        .limit(5);

      if (!sourceBlocks.length || !targetBlocks.length) {
        return false; // Нет данных для сравнения
      }

      // Усредняем векторы для каждой страницы
      const avgSourceVector = this.averageVectors(sourceBlocks.map(b => b.vector as number[]));
      const avgTargetVector = this.averageVectors(targetBlocks.map(b => b.vector as number[]));

      // Вычисляем cosine similarity
      const similarity = this.cosineSimilarity(avgSourceVector, avgTargetVector);

      if (similarity > threshold) {
        this.stats.cannibalBlocks++;
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking cannibalization:', error);
      return false; // В случае ошибки не блокируем
    }
  }

  // Усреднение векторов
  private averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const avgVector = new Array(dim).fill(0);
    
    for (const vector of vectors) {
      for (let i = 0; i < dim; i++) {
        avgVector[i] += vector[i];
      }
    }
    
    for (let i = 0; i < dim; i++) {
      avgVector[i] /= vectors.length;
    }
    
    return avgVector;
  }

  // Cosine similarity
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) return 0;
    
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
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  // Проверка стоп-листа анкоров
  private isStopAnchor(anchorText: string, stopAnchors: string[]): boolean {
    if (!anchorText || typeof anchorText !== 'string') return false;
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
