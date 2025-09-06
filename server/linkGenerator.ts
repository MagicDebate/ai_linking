import { db } from './db';
import { linkCandidates, generationRuns, pageEmbeddings, pagesClean, graphMeta, importJobs, blocks, pagesRaw, imports, embeddings } from '@shared/tables';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { EmbeddingService } from './embeddingService';
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
  private embeddingService: EmbeddingService;
  private startTime: number = 0;
  private embeddingCache: Map<string, any> = new Map(); // Кэш для embedding'ов
  private similarityCache: Map<string, any[]> = new Map(); // Кэш для похожих страниц
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
    this.embeddingService = new EmbeddingService();
  }

  // Создание записи о запуске генерации
  async createGenerationRun(params: GenerationParams): Promise<string> {
    console.log('🚀 [createGenerationRun] Starting...');
    console.log('🔍 [createGenerationRun] Project ID:', this.projectId);
    
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔍 [createGenerationRun] Generated runId:', runId);

    try {
      // Получаем последний импорт для проекта
      console.log('🔍 [createGenerationRun] Looking for latest import...');
      const latestImport = await db
        .select({ id: imports.id })
        .from(imports)
        .where(eq(imports.projectId, this.projectId))
        .orderBy(desc(imports.createdAt))
        .limit(1);

      console.log('🔍 [createGenerationRun] Found imports:', latestImport.length);
      if (latestImport.length > 0) {
        console.log('🔍 [createGenerationRun] Latest import ID:', latestImport[0].id);
      }

      if (!latestImport.length) {
        console.log('❌ [createGenerationRun] No imports found for project:', this.projectId);
        throw new Error('No imports found for this project');
      }

      const importId = latestImport[0].id;
      console.log('🔍 [createGenerationRun] Using import ID:', importId);

      // Создаем запись о запуске
      console.log('🔍 [createGenerationRun] Inserting into generationRuns...');
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

      console.log('✅ [createGenerationRun] Successfully created generation run:', runId);
      return runId;
    } catch (error) {
      console.error('❌ [createGenerationRun] Error:', error);
      throw error;
    }
  }

  // ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ ПО СЦЕНАРИЯМ
  async generateLinks(params: GenerationParams, runId: string): Promise<void> {
    console.log('🚨 [LinkGenerator] ===== НАЧАЛО ГЕНЕРАЦИИ ССЫЛОК =====');
    console.log('🚀 [LinkGenerator] generateLinks called with params:', JSON.stringify(params, null, 2));
    console.log('🚀 [LinkGenerator] runId:', runId);
    console.log('🚀 [LinkGenerator] projectId:', this.projectId);
    console.log('🚨 [LinkGenerator] ===== ПРОЕКТ ID:', this.projectId, '=====');
    
    // Инициализируем время начала
    this.startTime = Date.now();
    
    // Глобальный timeout для всей генерации (15 минут)
    const globalTimeout = setTimeout(() => {
      console.error('❌ [generateLinks] GLOBAL TIMEOUT: Generation taking too long, forcing failure');
      this.updateProgress(runId, 'failed', 0, 0, 0).catch(console.error);
    }, 900000); // 15 минут
    
    try {
      console.log('🚀 [generateLinks] Starting SPEC-COMPLIANT scenario-based link generation...');
      console.log('📋 [generateLinks] Active scenarios:', {
        orphanFix: params.scenarios.orphanFix,
        headConsolidation: params.scenarios.headConsolidation,
        clusterCrossLink: params.scenarios.clusterCrossLink,
        commercialRouting: params.scenarios.commercialRouting,
        depthLift: params.scenarios.depthLift.enabled ? `ON (minDepth: ${params.scenarios.depthLift.minDepth})` : 'OFF',
        freshnessPush: params.scenarios.freshnessPush.enabled ? `ON (${params.scenarios.freshnessPush.daysFresh} days, ${params.scenarios.freshnessPush.linksPerDonor} links)` : 'OFF'
      });
      
      // Apply old links policy before generation
      console.log('🔍 [generateLinks] Applying old links policy...');
      await this.handleOldLinksPolicy(params.policies.oldLinks, runId);
      console.log('✅ [generateLinks] Old links policy applied');
      
      // Phase 1: Load pages (0-20%)
      console.log('🔍 [generateLinks] Phase 1: Loading pages...');
      await this.updateProgress(runId, 'loading', 10, 0, 0);
      console.log('🔍 [generateLinks] Calling loadPages()...');
      
      let pages: any[] = [];
      try {
        pages = await this.loadPages();
        console.log('🔍 [generateLinks] loadPages() completed successfully, result:', pages.length, 'pages');
      } catch (error) {
        console.error('❌ [generateLinks] loadPages() failed with error:', error);
        await this.updateProgress(runId, 'failed', 20, 0, 0);
        throw error;
      }
      
      if (pages.length === 0) {
        console.log('❌ [generateLinks] No pages found, cannot generate links');
        await this.updateProgress(runId, 'failed', 20, 0, 0);
        throw new Error('No pages found for generation. Please complete import first.');
      }
      
      console.log('✅ [generateLinks] Loaded', pages.length, 'pages for generation');
      await this.updateProgress(runId, 'loading', 20, 0, 0, 0, pages.length);

      // Phase 2: Execute each scenario independently (20-80%)
      let totalGenerated = 0;
      let totalRejected = 0;
      let progressBase = 20;
      const scenarioCount = Object.values(params.scenarios).filter(s => 
        typeof s === 'boolean' ? s : s.enabled
      ).length;
      const progressPerScenario = 60 / Math.max(scenarioCount, 1);
      
      // Статистика сценариев
      const scenarioStats: any = {};

      // ORPHAN FIX SCENARIO
      if (params.scenarios.orphanFix) {
        console.log('🔗 Executing ORPHAN FIX scenario...');
        const result = await this.executeOrphanFixScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        scenarioStats.orphanFix = {
          generated: result.generated,
          rejected: result.rejected,
          status: 'completed'
        };
        await this.updateProgress(runId, 'generating', progressBase, totalGenerated, totalRejected, undefined, undefined, scenarioStats);
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
      
      // Update to 100% before finalizing
      await this.updateProgress(runId, 'finalizing', 100, totalGenerated, totalRejected);
      
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
      
      // Clear global timeout
      clearTimeout(globalTimeout);

    } catch (error) {
      console.error('❌ Link generation failed:', error);
      
      // Clear global timeout
      clearTimeout(globalTimeout);
      
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
    // Если graphMeta не загружается, считаем все страницы сиротами
    const orphanPages = pages.filter(page => {
      const isOrphan = page.isOrphan === true || page.isOrphan === 1 || page.inDegree === 0 || 
                      (page.isOrphan === null && page.inDegree === null); // Если данные не загружены, считаем сиротой
      console.log('🔍 [OrphanFix] Page check:', {
        url: page.url,
        isOrphan: page.isOrphan,
        inDegree: page.inDegree,
        result: isOrphan
      });
      return isOrphan;
    });
    console.log('🔍 [OrphanFix] Orphan pages found:', orphanPages.length);

    for (let i = 0; i < orphanPages.length; i++) {
      const orphanPage = orphanPages[i];
      console.log('🔍 [OrphanFix] Processing orphan page:', orphanPage.url, `(${i + 1}/${orphanPages.length})`);
      
      // Обновляем прогресс каждые 20 страниц для оптимальной скорости
      if ((i + 1) % 20 === 0 || i === orphanPages.length - 1) {
        await this.updateProgress(runId, 'generating', 30 + Math.round((i / orphanPages.length) * 20), generated, rejected, i + 1, orphanPages.length);
      }
      
      // Ищем похожие страницы через cosine similarity
      const similarPages = await this.findSimilarPagesByCosine(orphanPage, pages, 15, 0.45); // Больше кандидатов, ниже порог
      console.log('🔍 [OrphanFix] Similar pages found:', similarPages.length);
      console.log('🔍 [OrphanFix] Similar pages details:', similarPages.map(p => ({ url: p.url, score: p.score })));
      
      // Batch processing: обрабатываем все похожие страницы сразу
      const linkPromises = similarPages.map(async (similarPage) => {
        // Дополнительная проверка ID страниц
        if (!similarPage.id || !orphanPage.id) {
          console.log('❌ [OrphanFix] Skipping link - missing page IDs:', {
            similarPageId: similarPage.id,
            orphanPageId: orphanPage.id,
            similarPageUrl: similarPage.url,
            orphanPageUrl: orphanPage.url
          });
          return { created: false, reason: 'Missing page IDs' };
        }
        
        return await this.tryCreateLink(runId, similarPage, orphanPage, 'orphan_fix', params);
      });

      // Ждем все результаты параллельно
      const results = await Promise.all(linkPromises);
      
      // Подсчитываем результаты
      for (const result of results) {
        if (result.created) {
          generated++;
          console.log('✅ [OrphanFix] Link created successfully');
        } else {
          rejected++;
          console.log('❌ [OrphanFix] Link rejected, reason:', result.reason);
        }
      }
      
      // Обновляем прогресс только при создании ссылки (не после каждой)
      if (generated % 5 === 0) {
        await this.updateProgress(runId, 'generating', 30 + Math.round((i / orphanPages.length) * 20), generated, rejected, i + 1, orphanPages.length);
      }
    }

    console.log('🔍 [OrphanFix] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // HEAD CONSOLIDATION: консолидирует головные страницы
  private async executeHeadConsolidationScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [HeadConsolidation] Starting head consolidation scenario');
    console.log('🔍 [HeadConsolidation] Total pages:', pages.length);
    console.log('🔍 [HeadConsolidation] Hub pages configured:', params.hubPages.length);
    
    let generated = 0, rejected = 0;

    // Получаем hub страницы
    const hubPages = pages.filter(page => params.hubPages.includes(page.url));
    console.log('🔍 [HeadConsolidation] Hub pages found in data:', hubPages.length);

    for (const hubPage of hubPages) {
      console.log('🔍 [HeadConsolidation] Processing hub page:', hubPage.url);
      
      // Ищем похожие страницы через cosine similarity
      const similarPages = await this.findSimilarPagesByCosine(hubPage, pages, 5, 0.70); // Больше кандидатов
      console.log('🔍 [HeadConsolidation] Similar pages found:', similarPages.length);
      
      for (const similarPage of similarPages) {
        if (!similarPage.id || !hubPage.id) {
          console.log('❌ [HeadConsolidation] Skipping link - missing page IDs');
          rejected++;
          continue;
        }
        
        const result = await this.tryCreateLink(runId, similarPage, hubPage, 'head_consolidation', params);
        if (result.created) {
          generated++;
          console.log('✅ [HeadConsolidation] Link created:', similarPage.url, '->', hubPage.url);
        } else {
          rejected++;
          console.log('❌ [HeadConsolidation] Link rejected:', similarPage.url, '->', hubPage.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [HeadConsolidation] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // CLUSTER CROSS-LINK: создает взаимные ссылки внутри тематических кластеров
  private async executeClusterCrossLinkScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [ClusterCrossLink] Starting cluster cross-link scenario');
    console.log('🔍 [ClusterCrossLink] Total pages:', pages.length);
    
    let generated = 0, rejected = 0;

    // Группируем страницы по семантической близости
    for (let i = 0; i < pages.length; i++) {
      const page1 = pages[i];
      console.log('🔍 [ClusterCrossLink] Processing page:', page1.url, `(${i+1}/${pages.length})`);
      
      const similarPages = await this.findSimilarPagesByCosine(page1, pages, 5, 0.70); // Больше кандидатов
      console.log('🔍 [ClusterCrossLink] Similar pages found:', similarPages.length);
      
      for (const page2 of similarPages) {
        if (!page1.id || !page2.id) {
          console.log('❌ [ClusterCrossLink] Skipping link - missing page IDs');
          rejected++;
          continue;
        }
        
        const result = await this.tryCreateLink(runId, page1, page2, 'cluster_cross_link', params);
        if (result.created) {
          generated++;
          console.log('✅ [ClusterCrossLink] Link created:', page1.url, '->', page2.url);
        } else {
          rejected++;
          console.log('❌ [ClusterCrossLink] Link rejected:', page1.url, '->', page2.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [ClusterCrossLink] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // COMMERCIAL ROUTING: направляет трафик на коммерческие страницы
  private async executeCommercialRoutingScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [CommercialRouting] Starting commercial routing scenario');
    console.log('🔍 [CommercialRouting] Total pages:', pages.length);
    console.log('🔍 [CommercialRouting] Priority pages configured:', params.priorityPages.length);
    
    let generated = 0, rejected = 0;

    // Получаем money страницы
    const moneyPages = pages.filter(page => params.priorityPages.includes(page.url));
    console.log('🔍 [CommercialRouting] Money pages found in data:', moneyPages.length);

    for (const moneyPage of moneyPages) {
      console.log('🔍 [CommercialRouting] Processing money page:', moneyPage.url);
      
      // Ищем страницы, которые могут ссылаться на коммерческие
      const potentialDonors = pages.filter(page => !params.priorityPages.includes(page.url));
      console.log('🔍 [CommercialRouting] Potential donor pages:', potentialDonors.length);
      
      for (const donorPage of potentialDonors) {
        if (!donorPage.id || !moneyPage.id) {
          console.log('❌ [CommercialRouting] Skipping link - missing page IDs');
          rejected++;
          continue;
        }
        
        const result = await this.tryCreateLink(runId, donorPage, moneyPage, 'commercial_routing', params);
        if (result.created) {
          generated++;
          console.log('✅ [CommercialRouting] Link created:', donorPage.url, '->', moneyPage.url);
        } else {
          rejected++;
          console.log('❌ [CommercialRouting] Link rejected:', donorPage.url, '->', moneyPage.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [CommercialRouting] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // DEPTH LIFT: поднимает глубокие страницы
  private async executeDepthLiftScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [DepthLift] Starting depth lift scenario');
    console.log('🔍 [DepthLift] Total pages:', pages.length);
    console.log('🔍 [DepthLift] Min depth configured:', params.scenarios.depthLift.minDepth);
    
    let generated = 0, rejected = 0;

    // Получаем глубокие страницы
    const deepPages = pages.filter(page => page.clickDepth >= params.scenarios.depthLift.minDepth);
    console.log('🔍 [DepthLift] Deep pages found:', deepPages.length);

    for (const deepPage of deepPages) {
      console.log('🔍 [DepthLift] Processing deep page:', deepPage.url, 'depth:', deepPage.clickDepth);
      
      // Ищем похожие страницы с меньшей глубиной
      const shallowPages = pages.filter(page => page.clickDepth < params.scenarios.depthLift.minDepth);
      console.log('🔍 [DepthLift] Shallow pages available:', shallowPages.length);
      
      const similarPages = await this.findSimilarPagesByCosine(deepPage, shallowPages, 5, 0.65); // Больше кандидатов
      console.log('🔍 [DepthLift] Similar shallow pages found:', similarPages.length);
      
      for (const similarPage of similarPages) {
        if (!similarPage.id || !deepPage.id) {
          console.log('❌ [DepthLift] Skipping link - missing page IDs');
          rejected++;
          continue;
        }
        
        const result = await this.tryCreateLink(runId, similarPage, deepPage, 'depth_lift', params);
        if (result.created) {
          generated++;
          console.log('✅ [DepthLift] Link created:', similarPage.url, '->', deepPage.url);
        } else {
          rejected++;
          console.log('❌ [DepthLift] Link rejected:', similarPage.url, '->', deepPage.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [DepthLift] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // FRESHNESS PUSH: продвигает свежие страницы
  private async executeFreshnessPushScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    console.log('🔍 [FreshnessPush] Starting freshness push scenario');
    console.log('🔍 [FreshnessPush] Total pages:', pages.length);
    console.log('🔍 [FreshnessPush] Days fresh configured:', params.scenarios.freshnessPush.daysFresh);
    console.log('🔍 [FreshnessPush] Links per donor configured:', params.scenarios.freshnessPush.linksPerDonor);
    
    let generated = 0, rejected = 0;

    const daysFresh = params.scenarios.freshnessPush.daysFresh;
    const linksPerDonor = params.scenarios.freshnessPush.linksPerDonor;
    
    // Получаем свежие страницы
    const freshPages = pages.filter(page => {
      const publishedAt = new Date(page.publishedAt || page.createdAt);
      const daysSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePublished <= daysFresh;
    });
    console.log('🔍 [FreshnessPush] Fresh pages found:', freshPages.length);
      
    for (const freshPage of freshPages) {
      console.log('🔍 [FreshnessPush] Processing fresh page:', freshPage.url);
      
      // Ищем доноров для свежих страниц
      const potentialDonors = pages.filter(page => page.id !== freshPage.id);
      const selectedDonors = potentialDonors.slice(0, linksPerDonor);
      console.log('🔍 [FreshnessPush] Selected donor pages:', selectedDonors.length);
        
      for (const donorPage of selectedDonors) {
        if (!donorPage.id || !freshPage.id) {
          console.log('❌ [FreshnessPush] Skipping link - missing page IDs');
          rejected++;
          continue;
        }
        
        const result = await this.tryCreateLink(runId, donorPage, freshPage, 'freshness_push', params);
        if (result.created) {
          generated++;
          console.log('✅ [FreshnessPush] Link created:', donorPage.url, '->', freshPage.url);
        } else {
          rejected++;
          console.log('❌ [FreshnessPush] Link rejected:', donorPage.url, '->', freshPage.url, 'Reason:', result.reason);
        }
      }
    }

    console.log('🔍 [FreshnessPush] Scenario completed - Generated:', generated, 'Rejected:', rejected);
    return { generated, rejected };
  }

  // ОПТИМИЗИРОВАННЫЙ МЕТОД: Поиск похожих страниц через cosine similarity с кэшированием
  private async findSimilarPagesByCosine(sourcePage: any, allPages: any[], limit: number, threshold: number): Promise<any[]> {
    const cacheKey = `${sourcePage.id}_${limit}_${threshold}`;
    
    // Проверяем кэш
    if (this.similarityCache.has(cacheKey)) {
      console.log(`🚀 [findSimilarPagesByCosine] Cache hit for ${sourcePage.url}`);
      return this.similarityCache.get(cacheKey)!;
    }
    
    console.log(`🔍 [findSimilarPagesByCosine] Finding similar pages for ${sourcePage.url} (threshold: ${threshold}, limit: ${limit})`);
    console.log(`🔍 [findSimilarPagesByCosine] Source page ID: ${sourcePage.id}`);
    console.log(`🔍 [findSimilarPagesByCosine] Total pages to search: ${allPages.length}`);
    
    // Получаем блоки исходной страницы
    const sourceBlocks = await db
      .select({ id: blocks.id })
      .from(blocks)
      .where(eq(blocks.pageId, sourcePage.id));

    console.log(`🔍 [findSimilarPagesByCosine] Source blocks found: ${sourceBlocks.length}`);
    
    if (sourceBlocks.length === 0) {
      console.log('⚠️ [findSimilarPagesByCosine] No blocks found for source page');
      const fallback = this.getFallbackPages(sourcePage, allPages, limit);
      this.similarityCache.set(cacheKey, fallback);
      return fallback;
    }

    const similarities: Array<{ page: any, score: number }> = [];

    // Для каждого блока исходной страницы ищем похожие блоки
    for (const sourceBlock of sourceBlocks) {
      try {
        const similarBlocks = await this.embeddingService.findSimilarBlocks(
          sourceBlock.id,
          this.projectId,
          embeddings,
          5, // Уменьшили topK для скорости
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
            console.log('🔍 [findSimilarPagesByCosine] Looking for page:', {
              targetPageId: targetBlock[0].pageId,
              foundPage: targetPage ? { id: targetPage.id, url: targetPage.url } : null,
              allPagesCount: allPages.length
            });
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
      const fallback = this.getFallbackPages(sourcePage, allPages, limit);
      this.similarityCache.set(cacheKey, fallback);
      return fallback;
    }

    // Сортируем по score и берем top limit
    const result = similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.page)
      .filter(page => page && page.id); // Фильтруем страницы без ID
    
    console.log(`🔍 [findSimilarPagesByCosine] Returning ${result.length} similar pages with valid IDs`);
    
    // Кэшируем результат
    this.similarityCache.set(cacheKey, result);
    return result;
  }

  // Вспомогательный метод для fallback страниц
  private getFallbackPages(sourcePage: any, allPages: any[], limit: number): any[] {
    const otherPages = allPages.filter(p => p.id !== sourcePage.id);
    const shuffled = otherPages.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  }

  // Попытка создать ссылку с проверкой всех политик
  private async tryCreateLink(runId: string, sourcePage: any, targetPage: any, scenario: string, params: GenerationParams): Promise<{ created: boolean, reason?: string, anchor?: string }> {
    console.log(`🔍 [tryCreateLink] Attempting to create link: ${sourcePage.url} -> ${targetPage.url} (scenario: ${scenario})`);
    console.log(`🔍 [tryCreateLink] Source ID: ${sourcePage.id}, Target ID: ${targetPage.id}`);
    
    try {
      // 1. Базовые проверки
      if (sourcePage.id === targetPage.id) {
        console.log('❌ [tryCreateLink] Self-link not allowed');
        return { created: false, reason: 'Self-link not allowed' };
      }

      // 2. Проверка дубликатов
      if (params.policies.removeDuplicates) {
        const isDuplicate = await this.isDuplicateLink(sourcePage.url, targetPage.url, runId);
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
      console.log('🔍 [tryCreateLink] Creating link:', {
        sourcePageId: sourcePage.id,
        targetPageId: targetPage.id,
        sourceUrl: sourcePage.url,
        targetUrl: targetPage.url,
        scenario
      });
      
      // Проверяем что у нас есть ID страниц
      if (!sourcePage.id || !targetPage.id) {
        console.error('❌ [tryCreateLink] Missing page IDs:', {
          sourcePageId: sourcePage.id,
          targetPageId: targetPage.id,
          sourceUrl: sourcePage.url,
          targetUrl: targetPage.url
        });
        return { created: false, reason: 'Missing page IDs' };
      }
      
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

      console.log('✅ [tryCreateLink] Link created successfully with anchor:', anchorText);
      return { created: true, anchor: anchorText };

    } catch (error) {
      console.error('❌ [tryCreateLink] Database error creating link:', error);
      console.error('❌ [tryCreateLink] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        runId,
        sourceUrl: sourcePage.url,
        targetUrl: targetPage.url,
        sourceId: sourcePage.id,
        targetId: targetPage.id,
        scenario
      });
      return { created: false, reason: 'Database error' };
    }
  }

  // Обновление прогресса генерации
  private async updateProgress(runId: string, phase: string, percent: number, generated: number, rejected: number, processedPages?: number, totalPages?: number, scenarioStats?: any) {
    try {
      console.log(`🔍 [updateProgress] Updating run ${runId}: phase=${phase}, percent=${percent}, generated=${generated}, rejected=${rejected}, processed=${processedPages}/${totalPages}`);
      
      // Собираем детальную статистику
      const detailedStats = {
        pages: processedPages && totalPages ? {
          processed: processedPages,
          total: totalPages,
          percent: Math.round((processedPages / totalPages) * 100)
        } : undefined,
        links: {
          generated,
          rejected,
          total: generated + rejected
        },
        scenarios: scenarioStats || {},
        timing: {
          startedAt: new Date().toISOString(),
          estimatedRemaining: processedPages && totalPages ? 
            Math.round(((totalPages - processedPages) / processedPages) * (Date.now() - this.startTime) / 1000) : undefined
        }
      };
      
      await db
        .update(generationRuns)
        .set({
          status: 'running', // Обновляем статус на running
          phase,
          percent,
          generated,
          rejected,
          taskProgress: detailedStats
        })
        .where(eq(generationRuns.runId, runId));
      
      console.log(`✅ [updateProgress] Successfully updated run ${runId}`);
    } catch (error) {
      console.error(`❌ [updateProgress] Error updating run ${runId}:`, error);
      throw error;
    }
  }

  // Загрузка страниц проекта
  private async loadPages(): Promise<any[]> {
    console.log('🚨 [loadPages] ===== НАЧАЛО ЗАГРУЗКИ СТРАНИЦ =====');
    console.log('🔍 [loadPages] Loading pages for project:', this.projectId);
    console.log('🚨 [loadPages] ===== ПРОЕКТ ID:', this.projectId, '=====');
    
    try {
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
        id: pagesClean.id, // ИСПРАВЛЕНО: используем pagesClean.id для foreign key
        url: pagesRaw.url,
        title: sql<string>`COALESCE(${pagesRaw.meta}->>'title', '')`,
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
      .leftJoin(graphMeta, eq(pagesRaw.id, graphMeta.pageId))
      .where(and(
        eq(pagesRaw.jobId, jobId),
        sql`${pagesClean.id} IS NOT NULL`,
        sql`${pagesRaw.url} IS NOT NULL`
      ));

    console.log('🔍 [loadPages] Found pages:', pages.length);
    if (pages.length > 0) {
      console.log('🔍 [loadPages] Sample page:', pages[0]);
      console.log('🔍 [loadPages] Orphan pages:', pages.filter((p: any) => p.isOrphan).length);
      
      // Проверим есть ли страницы без ID или URL
      const pagesWithoutId = pages.filter((p: any) => !p.id);
      const pagesWithoutUrl = pages.filter((p: any) => !p.url);
      console.log('🔍 [loadPages] Pages without ID:', pagesWithoutId.length);
      console.log('🔍 [loadPages] Pages without URL:', pagesWithoutUrl.length);
      
      if (pagesWithoutId.length > 0) {
        console.log('❌ [loadPages] Sample page without ID:', pagesWithoutId[0]);
      }
      if (pagesWithoutUrl.length > 0) {
        console.log('❌ [loadPages] Sample page without URL:', pagesWithoutUrl[0]);
      }
    } else {
      console.log('❌ [loadPages] No pages found for jobId:', jobId);
      
      // Попробуем найти страницы без graphMeta
      const simplePages = await db
        .select({
          id: pagesClean.id, // ИСПРАВЛЕНО: используем pagesClean.id для foreign key
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
    } catch (error) {
      console.error('❌ [loadPages] Error loading pages:', error);
      throw error;
    }
  }

  // Обработка политики старых ссылок
  private async handleOldLinksPolicy(policy: string, runId: string): Promise<void> {
    console.log(`🔍 [handleOldLinksPolicy] Starting with policy: ${policy}`);
    console.log(`🔍 [handleOldLinksPolicy] Run ID: ${runId}`);
    
    try {
      // PLACEHOLDER: Реализация политики старых ссылок
      console.log(`📋 [handleOldLinksPolicy] Applying old links policy: ${policy}`);
      
      // Простая заглушка - ничего не делаем
      console.log(`✅ [handleOldLinksPolicy] Policy ${policy} applied successfully (placeholder)`);
    } catch (error) {
      console.error(`❌ [handleOldLinksPolicy] Error applying policy ${policy}:`, error);
      throw error;
    }
  }

  // Проверка дубликатов ссылок
  private async isDuplicateLink(sourceUrl: string, targetUrl: string, runId?: string): Promise<boolean> {
    const conditions = [
      eq(linkCandidates.sourceUrl, sourceUrl),
      eq(linkCandidates.targetUrl, targetUrl)
    ];
    
    // Если указан runId, проверяем дубликаты только в рамках текущей генерации
    if (runId) {
      conditions.push(eq(linkCandidates.runId, runId));
    }
    
    const existing = await db
      .select()
      .from(linkCandidates)
      .where(and(...conditions))
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
    const title = String(targetPage.title || '');
    
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
    console.log('🚨 [LinkGenerationWorker] ===== НАЧАЛО РАБОТЫ ВОРКЕРА =====');
    console.log('🚀 [LinkGenerationWorker] Starting generation for runId:', runId);
    console.log('🚀 [LinkGenerationWorker] SEO Profile:', JSON.stringify(seoProfile, null, 2));
    console.log('🚨 [LinkGenerationWorker] ===== RUN ID:', runId, '=====');
    
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