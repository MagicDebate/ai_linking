import { db } from './db';
import { linkCandidates, generationRuns, pageEmbeddings, pagesClean, graphMeta, importJobs, embeddings, blocks, pagesRaw, imports } from '@shared/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { embeddingService } from './embeddingService';
import { linkGenerationQueue } from './queue';
import { openaiService } from './openaiService';

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

// Статистика генерации
interface GenerationStats {
  totalGenerated: number;
  totalRejected: number;
  duplicatesRemoved: number;
  cannibalBlocks: number;
  stopAnchorsApplied: number;
  similarityMatches: number;
}

export class LinkGenerator {
  private projectId: string;
  private stats: GenerationStats = {
    totalGenerated: 0,
    totalRejected: 0,
    duplicatesRemoved: 0,
    cannibalBlocks: 0,
    stopAnchorsApplied: 0,
    similarityMatches: 0
  };

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  // Создание записи о запуске генерации
  async createGenerationRun(params: GenerationParams): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Получаем последний импорт для проекта
    const latestImport = await db
      .select({ id: imports.id })
      .from(imports)
      .where(eq(imports.projectId, this.projectId))
      .orderBy(desc(imports.createdAt))
      .limit(1);

    if (!latestImport.length) {
      throw new Error('No imports found for this project');
    }

    const importId = latestImport[0].id;

    // Создаем запись о запуске
    await db
      .insert(generationRuns)
      .values({
        runId,
        projectId: this.projectId,
        importId: importId,
        status: 'running',
        phase: 'initialization',
        percent: 0,
        generated: 0,
        rejected: 0
      });

    return runId;
  }

  // ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ ПО СЦЕНАРИЯМ
  async generateLinks(params: GenerationParams, runId: string): Promise<void> {
    console.log('🚀 [LinkGenerator] generateLinks called with params:', JSON.stringify(params, null, 2));
    console.log('🚀 [LinkGenerator] runId:', runId);
    console.log('🚀 [LinkGenerator] projectId:', this.projectId);
    
    try {

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
      
      if (pages.length === 0) {
        console.log('❌ [generateLinks] No pages found, cannot generate links');
        await this.updateProgress(runId, 'failed', 20, 0, 0);
        throw new Error('No pages found for generation. Please complete import first.');
      }
      
      console.log('✅ [generateLinks] Loaded', pages.length, 'pages for generation');
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

      // Final phase (80-100%)
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

  // ORPHAN FIX: поднимает сиротские страницы
  private async executeOrphanFixScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [OrphanFix] Starting orphan fix scenario');
    console.log('🔍 [OrphanFix] Total pages:', pages.length);
    
    let generated = 0, rejected = 0;

    // Получаем сиротские страницы
    const orphanPages = pages.filter(page => page.isOrphan);
    console.log('🔍 [OrphanFix] Orphan pages found:', orphanPages.length);

    for (const orphanPage of orphanPages) {
      console.log('🔍 [OrphanFix] Processing orphan page:', orphanPage.url);
      
      // Ищем похожие страницы через cosine similarity
      const similarPages = await this.findSimilarPagesByCosine(orphanPage, pages, 5, 0.70); // Пониженный порог для сирот
      console.log('🔍 [OrphanFix] Similar pages found:', similarPages.length);
      
      for (const similarPage of similarPages) {
        const result = await this.tryCreateLink(runId, similarPage, orphanPage, 'orphan_fix', params);
        if (result.created) {
          generated++;
          console.log('✅ [OrphanFix] Link created:', similarPage.url, '->', orphanPage.url);
        } else {
          rejected++;
          console.log('❌ [OrphanFix] Link rejected:', similarPage.url, '->', orphanPage.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [OrphanFix] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // HEAD CONSOLIDATION: консолидирует головные страницы
  private async executeHeadConsolidationScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let generated = 0, rejected = 0;

    // Получаем hub страницы
    const hubPages = pages.filter(page => params.hubPages.includes(page.url));

    for (const hubPage of hubPages) {
      // Ищем похожие страницы через cosine similarity
      const similarPages = await this.findSimilarPagesByCosine(hubPage, pages, 3, 0.78);
      
      for (const similarPage of similarPages) {
        const result = await this.tryCreateLink(runId, similarPage, hubPage, 'head_consolidation', params);
        if (result.created) {
          generated++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // CLUSTER CROSS-LINK: создает взаимные ссылки внутри тематических кластеров
  private async executeClusterCrossLinkScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let generated = 0, rejected = 0;

    // Группируем страницы по семантической близости
    for (let i = 0; i < pages.length; i++) {
      const page1 = pages[i];
      const similarPages = await this.findSimilarPagesByCosine(page1, pages, 3, 0.78);
      
      for (const page2 of similarPages) {
        const result = await this.tryCreateLink(runId, page1, page2, 'cluster_cross_link', params);
        if (result.created) {
          generated++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // COMMERCIAL ROUTING: направляет трафик на коммерческие страницы
  private async executeCommercialRoutingScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let generated = 0, rejected = 0;

    // Получаем money страницы
    const moneyPages = pages.filter(page => params.priorityPages.includes(page.url));

    for (const moneyPage of moneyPages) {
      // Ищем страницы, которые могут ссылаться на коммерческие
      const potentialDonors = pages.filter(page => !params.priorityPages.includes(page.url));
      
      for (const donorPage of potentialDonors) {
        const result = await this.tryCreateLink(runId, donorPage, moneyPage, 'commercial_routing', params);
      if (result.created) {
        generated++;
      } else {
        rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // DEPTH LIFT: поднимает глубокие страницы
  private async executeDepthLiftScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let generated = 0, rejected = 0;

    // Получаем глубокие страницы
    const deepPages = pages.filter(page => page.clickDepth >= params.scenarios.depthLift.minDepth);

    for (const deepPage of deepPages) {
      // Ищем похожие страницы с меньшей глубиной
      const shallowPages = pages.filter(page => page.clickDepth < params.scenarios.depthLift.minDepth);
      const similarPages = await this.findSimilarPagesByCosine(deepPage, shallowPages, 3, 0.70);
      
      for (const similarPage of similarPages) {
        const result = await this.tryCreateLink(runId, similarPage, deepPage, 'depth_lift', params);
        if (result.created) {
          generated++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // FRESHNESS PUSH: продвигает свежие страницы
  private async executeFreshnessPushScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let generated = 0, rejected = 0;

    const daysFresh = params.scenarios.freshnessPush.daysFresh;
    const linksPerDonor = params.scenarios.freshnessPush.linksPerDonor;
    
    // Получаем свежие страницы
    const freshPages = pages.filter(page => {
      const publishedAt = new Date(page.publishedAt || page.createdAt);
      const daysSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePublished <= daysFresh;
    });
      
      for (const freshPage of freshPages) {
      // Ищем доноров для свежих страниц
      const potentialDonors = pages.filter(page => page.id !== freshPage.id);
      const selectedDonors = potentialDonors.slice(0, linksPerDonor);
        
      for (const donorPage of selectedDonors) {
        const result = await this.tryCreateLink(runId, donorPage, freshPage, 'freshness_push', params);
        if (result.created) {
          generated++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // НОВЫЙ МЕТОД: Поиск похожих страниц через cosine similarity
  private async findSimilarPagesByCosine(sourcePage: any, allPages: any[], limit: number, threshold: number): Promise<any[]> {
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
      try {
        const similarBlocks = await embeddingService.findSimilarBlocks(
          sourceBlock.id,
          this.projectId,
          10, // topK
          threshold
        );

        console.log(`🔍 [findSimilarPagesByCosine] Found ${similarBlocks.length} similar blocks for block ${sourceBlock.id}`);

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
      } catch (error) {
        console.log('⚠️ [findSimilarPagesByCosine] Error finding similar blocks, using fallback:', error);
      }
    }

    // Если не нашли похожих страниц через эмбеддинги, используем fallback
    if (similarities.length === 0) {
      console.log('⚠️ [findSimilarPagesByCosine] No similar pages found via embeddings, using fallback');
      
      // Fallback: возвращаем случайные страницы (кроме самой себя)
      const otherPages = allPages.filter(p => p.id !== sourcePage.id);
      const shuffled = otherPages.sort(() => Math.random() - 0.5);
      
      return shuffled.slice(0, limit).map(page => ({
        page,
        score: 0.5 // Низкий score для fallback
      }));
    }

    // Сортируем по score и берем top limit
    const result = similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.page);
    
    console.log(`🔍 [findSimilarPagesByCosine] Returning ${result.length} similar pages`);
    return result;
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

      // 6. Рерайт предложения с вставкой ссылки
      let modifiedSentence = null;
      try {
        // Получаем исходный текст страницы-донора
        const sourceBlock = await db
          .select({ text: blocks.text })
          .from(blocks)
          .where(eq(blocks.pageId, sourcePage.id))
          .limit(1);

        if (sourceBlock.length > 0) {
          const sourceText = sourceBlock[0].text;
          const targetTitle = targetPage.title || '';
          const targetDescription = targetPage.description || '';

          // Рерайтим предложение с вставкой ссылки
          modifiedSentence = await openaiService.rewriteSentenceWithLink(
            sourceText.substring(0, 200), // Берем первые 200 символов
            targetTitle,
            targetDescription,
            anchorText
          );
        }
      } catch (error) {
        console.log('⚠️ [tryCreateLink] Sentence rewrite failed, continuing without it');
      }

      // 7. Создание ссылки в БД
      await db.insert(linkCandidates).values({
        runId: runId,
        sourcePageId: sourcePage.id,
        targetPageId: targetPage.id,
        sourceUrl: sourcePage.url,
        targetUrl: targetPage.url,
        anchorText: anchorText,
        type: scenario,
        status: 'accepted',
        anchorSource: 'ai', // или 'text' или 'generic' в зависимости от источника
        confidence: 0.8, // Заглушка
        positionHint: { pageId: sourcePage.id, blockId: 1, offset: 0 }, // Заглушка
        similarity: 0.75, // Заглушка
        modifiedSentence: modifiedSentence
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
    console.log('🔍 [loadPages] Loading pages for project:', this.projectId);
    
    // Получаем последний завершенный импорт для проекта
    console.log('🔍 [loadPages] Looking for completed imports...');
    const latestImport = await db
      .select({ jobId: importJobs.jobId, status: importJobs.status, startedAt: importJobs.startedAt })
      .from(importJobs)
      .where(and(
        eq(importJobs.projectId, this.projectId),
        eq(importJobs.status, 'completed')
      ))
      .orderBy(desc(importJobs.startedAt))
      .limit(1);

    console.log('🔍 [loadPages] Found imports:', latestImport.length);
    if (latestImport.length > 0) {
      console.log('🔍 [loadPages] Latest import:', latestImport[0]);
    }

    if (!latestImport.length) {
      console.log('❌ [loadPages] No completed import found for project:', this.projectId);
      
      // Проверим какие импорты есть вообще
      const allImports = await db
        .select({ jobId: importJobs.jobId, status: importJobs.status, startedAt: importJobs.startedAt })
        .from(importJobs)
        .where(eq(importJobs.projectId, this.projectId))
        .orderBy(desc(importJobs.startedAt))
        .limit(5);
      
      console.log('🔍 [loadPages] All imports for project:', allImports);
      return [];
    }

    const jobId = latestImport[0].jobId;
    console.log('🔍 [loadPages] Using jobId from latest import:', jobId);
    
    // Проверим есть ли страницы для этого jobId
    const pagesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(pagesRaw)
      .where(eq(pagesRaw.jobId, jobId));
    
    console.log('🔍 [loadPages] Raw pages count for jobId:', pagesCount[0].count);
    
    // Проверим есть ли graphMeta для этого jobId
    const graphMetaCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(graphMeta)
      .where(eq(graphMeta.jobId, jobId));
    
    console.log('🔍 [loadPages] GraphMeta count for jobId:', graphMetaCount[0].count);
    
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
      .where(eq(pagesRaw.jobId, jobId));

    console.log('🔍 [loadPages] Found pages:', pages.length);
    if (pages.length > 0) {
      console.log('🔍 [loadPages] Sample page:', pages[0]);
      console.log('🔍 [loadPages] Orphan pages:', pages.filter((p: any) => p.isOrphan).length);
    } else {
      console.log('❌ [loadPages] No pages found for jobId:', jobId);
      
      // Попробуем найти страницы без graphMeta
      const simplePages = await db
        .select({
          id: pagesClean.id,
          url: pagesRaw.url,
          title: pagesRaw.meta,
          wordCount: pagesClean.wordCount,
          clickDepth: sql<number>`1`,
          inDegree: sql<number>`0`,
          outDegree: sql<number>`0`,
          isOrphan: sql<boolean>`true`,
          publishedAt: pagesRaw.createdAt,
          createdAt: pagesClean.createdAt
        })
        .from(pagesClean)
        .innerJoin(pagesRaw, eq(pagesClean.pageRawId, pagesRaw.id))
        .where(eq(pagesRaw.jobId, jobId));
      
      console.log('🔍 [loadPages] Simple pages found:', simplePages.length);
      if (simplePages.length > 0) {
        console.log('🔍 [loadPages] Sample simple page:', simplePages[0]);
        return simplePages;
      }
    }

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

  // Генерация текста анкора (3-шаговый алгоритм)
  private async generateAnchorText(sourcePage: any, targetPage: any, params: GenerationParams): Promise<string> {
    console.log('🔗 [generateAnchorText] Starting anchor generation for:', targetPage.url);
    
    try {
      // Шаг A: Естественный анкор из текста
      const naturalAnchor = await this.findNaturalAnchor(sourcePage, targetPage, params);
      if (naturalAnchor) {
        console.log('✅ [generateAnchorText] Found natural anchor:', naturalAnchor);
        return naturalAnchor;
      }

      // Шаг B: Анкор через ИИ
      try {
        const aiAnchor = await this.generateAIAnchor(sourcePage, targetPage, params);
        if (aiAnchor && openaiService.validateAnchorText(aiAnchor, params.stopAnchors)) {
          console.log('✅ [generateAnchorText] Generated AI anchor:', aiAnchor);
          return aiAnchor;
        }
      } catch (error) {
        console.log('⚠️ [generateAnchorText] AI anchor generation failed, using fallback');
      }

      // Шаг C: Fallback generic/partial
      const fallbackAnchor = this.generateFallbackAnchor(targetPage, params);
      console.log('✅ [generateAnchorText] Using fallback anchor:', fallbackAnchor);
      return fallbackAnchor;
      
    } catch (error) {
      console.error('❌ [generateAnchorText] Error:', error);
      return `Ссылка на ${targetPage.title || targetPage.url}`;
    }
  }

  // Шаг A: Поиск естественного анкора в тексте
  private async findNaturalAnchor(sourcePage: any, targetPage: any, params: GenerationParams): Promise<string | null> {
    try {
      // Получаем блоки страницы-донора
      const sourceBlocks = await db
        .select({ text: blocks.text })
        .from(blocks)
        .where(eq(blocks.pageId, sourcePage.id));

      if (!sourceBlocks.length) {
        return null;
      }

      // Ищем н-граммы 2-6 слов в тексте
      const targetKeywords = this.extractKeywords(targetPage.title || '', targetPage.description || '');
      
      for (const block of sourceBlocks) {
        const text = block.text.toLowerCase();
        
        // Ищем точные совпадения ключевых слов
        for (const keyword of targetKeywords) {
          const words = keyword.split(' ');
          if (words.length >= 2 && words.length <= 6) {
            const phrase = words.join(' ');
            if (text.includes(phrase) && !this.isStopAnchor(phrase, params.stopAnchors)) {
              return phrase;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('❌ [findNaturalAnchor] Error:', error);
      return null;
    }
  }

  // Шаг B: Генерация анкора через ИИ
  private async generateAIAnchor(sourcePage: any, targetPage: any, params: GenerationParams): Promise<string | null> {
    try {
      // Берем первый блок страницы-донора для контекста
      const sourceBlock = await db
        .select({ text: blocks.text })
        .from(blocks)
        .where(eq(blocks.pageId, sourcePage.id))
        .limit(1);

      if (!sourceBlock.length) {
        return null;
      }

      const sourceText = sourceBlock[0].text.substring(0, 500); // Ограничиваем длину
      const targetTitle = targetPage.title || '';
      const targetDescription = targetPage.description || '';

      const aiAnchor = await openaiService.generateAnchorText(
        sourceText,
        targetTitle,
        targetDescription,
        8 // maxWords
      );

      return aiAnchor;
    } catch (error) {
      console.error('❌ [generateAIAnchor] Error:', error);
      return null;
    }
  }

  // Шаг C: Fallback анкор
  private generateFallbackAnchor(targetPage: any, params: GenerationParams): string {
    const title = targetPage.title || '';
    
    // Извлекаем ключевые слова из заголовка
    const words = title.split(/\s+/).filter(word => word.length > 3).slice(0, 4);
    
    if (words.length >= 2) {
      return words.join(' ');
    }
    
    // Если не получилось - используем заголовок целиком
    return title.length > 50 ? title.substring(0, 50) + '...' : title;
  }

  // Извлечение ключевых слов
  private extractKeywords(title: string, description: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    
    // Удаляем HTML теги и специальные символы
    const cleanText = text.replace(/<[^>]*>/g, ' ')
                         .replace(/[^\w\s]/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    
    // Разбиваем на слова и фильтруем стоп-слова
    const stopWords = new Set([
      'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'об', 'при', 'за', 'под', 'над',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'
    ]);
    
    const words = cleanText.split(' ')
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 20); // Берем топ 20 ключевых слов
    
    return words;
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

// Класс для выполнения генерации ссылок
export class LinkGenerationWorker {
  constructor() {
    console.log('🔧 LinkGenerationWorker initialized');
  }

  async generateLinks(seoProfile: any, runId: string): Promise<void> {
    console.log('🚀 [LinkGenerationWorker] Starting generation for runId:', runId);
    console.log('🚀 [LinkGenerationWorker] SEO Profile:', JSON.stringify(seoProfile, null, 2));
    
    try {
      // Получаем информацию о run
      const run = await db
        .select({ projectId: generationRuns.projectId })
        .from(generationRuns)
        .where(eq(generationRuns.runId, runId))
        .limit(1);

      if (!run.length) {
        throw new Error(`Run ${runId} not found`);
      }

      const projectId = run[0].projectId;
      console.log('🚀 [LinkGenerationWorker] Project ID:', projectId);

      // Создаем экземпляр LinkGenerator
      const generator = new LinkGenerator(projectId);
      
      console.log('🚀 [LinkGenerationWorker] LinkGenerator created, starting generateLinks...');
      
      // Запускаем генерацию
      await generator.generateLinks(seoProfile, runId);
      
      console.log('✅ [LinkGenerationWorker] Generation completed successfully');
      
      // Обновляем статус на draft
      await db.update(generationRuns).set({
        status: 'draft',
        phase: 'completed',
        percent: 100,
        finishedAt: new Date()
      }).where(eq(generationRuns.runId, runId));
      
      console.log('✅ [LinkGenerationWorker] Run status updated to draft');
      
    } catch (error) {
      console.error('❌ [LinkGenerationWorker] Generation failed:', error);
      console.error('❌ [LinkGenerationWorker] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Обновляем статус на failed
      await db.update(generationRuns).set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date()
      }).where(eq(generationRuns.runId, runId));
      
      throw error;
    }
  }
}