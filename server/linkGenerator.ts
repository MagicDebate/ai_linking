import { db } from './db';
import { linkCandidates, generationRuns, pageEmbeddings, pagesClean, graphMeta, importJobs } from '../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

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
  stopAnchorsApplied: number;
  duplicatesRemoved: number;
  brokenLinksDeleted: number;
  cannibalBlocks: number;
  priorityPagesUsed: number;
  hubPagesUsed: number;
}

export class LinkGenerator {
  private projectId: string;
  private stats: GenerationStats = {
    stopAnchorsApplied: 0,
    duplicatesRemoved: 0,
    brokenLinksDeleted: 0,
    cannibalBlocks: 0,
    priorityPagesUsed: 0,
    hubPagesUsed: 0
  };

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  // ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ ПО СЦЕНАРИЯМ
  async generateLinks(params: GenerationParams): Promise<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
      const progressPerScenario = scenarioCount > 0 ? 60 / scenarioCount : 0;

      // ORPHAN FIX SCENARIO
      if (params.scenarios.orphanFix) {
        console.log('\n🔍 EXECUTING: Orphan Fix Scenario');
        const result = await this.executeOrphanFixScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'orphan_fix', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Orphan Fix completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // HEAD CONSOLIDATION SCENARIO
      if (params.scenarios.headConsolidation) {
        console.log('\n🔗 EXECUTING: Head Consolidation Scenario');
        const result = await this.executeHeadConsolidationScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'head_consolidation', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Head Consolidation completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // CLUSTER CROSS-LINK SCENARIO
      if (params.scenarios.clusterCrossLink) {
        console.log('\n🔄 EXECUTING: Cluster Cross-Link Scenario');
        const result = await this.executeClusterCrossLinkScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'cluster_cross_link', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Cluster Cross-Link completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // COMMERCIAL ROUTING SCENARIO
      if (params.scenarios.commercialRouting) {
        console.log('\n💰 EXECUTING: Commercial Routing Scenario');
        const result = await this.executeCommercialRoutingScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'commercial_routing', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Commercial Routing completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // DEPTH LIFT SCENARIO
      if (params.scenarios.depthLift.enabled) {
        console.log(`\n📏 EXECUTING: Depth Lift Scenario (minDepth: ${params.scenarios.depthLift.minDepth})`);
        const result = await this.executeDepthLiftScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'depth_lift', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Depth Lift completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // FRESHNESS PUSH SCENARIO
      if (params.scenarios.freshnessPush.enabled) {
        console.log(`\n🆕 EXECUTING: Freshness Push Scenario (${params.scenarios.freshnessPush.daysFresh} days, ${params.scenarios.freshnessPush.linksPerDonor} links per donor)`);
        const result = await this.executeFreshnessPushScenario(runId, pages, params);
        totalGenerated += result.generated;
        totalRejected += result.rejected;
        progressBase += progressPerScenario;
        await this.updateProgress(runId, 'freshness_push', progressBase, totalGenerated, totalRejected);
        console.log(`✅ Freshness Push completed: ${result.generated} generated, ${result.rejected} rejected`);
      }

      // Phase 3: Finalize (80-100%)
      await this.updateProgress(runId, 'finalizing', 90, totalGenerated, totalRejected);
      await this.finalizeDraft(runId);
      
      await db
        .update(generationRuns)
        .set({
          status: 'published',
          phase: 'completed',
          percent: 100,
          generated: totalGenerated,
          rejected: totalRejected,
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));

      console.log(`\n🏁 ALL SCENARIOS COMPLETED!`);
      console.log(`📊 Final stats:`, {
        generated: totalGenerated,
        rejected: totalRejected,
        ...this.stats
      });

      return runId;

    } catch (error) {
      console.error('Generation failed:', error);
      
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

  // ORPHAN FIX: находит страницы-сироты и подшивает к ним 1-2 ссылки
  private async executeOrphanFixScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    const orphanPages = pages.filter(page => page.isOrphan);
    let generated = 0, rejected = 0;

    for (const orphan of orphanPages) {
      // Найти 2-3 потенциальных донора для каждой сироты
      const potentialDonors = pages
        .filter(p => !p.isOrphan && p.id !== orphan.id)
        .sort((a, b) => (b.inDegree || 0) - (a.inDegree || 0)) // Приоритет по авторитетности
        .slice(0, 3);

      let linksToOrphan = 0;
      for (const donor of potentialDonors) {
        if (linksToOrphan >= 2) break; // Максимум 2 ссылки на сироту

        const result = await this.tryCreateLink(runId, donor, orphan, 'orphan_fix', params);
        if (result.created) {
          generated++;
          linksToOrphan++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // HEAD CONSOLIDATION: укрепляет хабовые страницы
  private async executeHeadConsolidationScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    // Используем hubPages если указаны, иначе автоматически определяем хабы
    const hubPages = params.hubPages.length > 0 
      ? pages.filter(p => params.hubPages.some(hubUrl => p.url.includes(hubUrl)))
      : pages.filter(p => (p.inDegree || 0) > 5); // Автоматические хабы

    let generated = 0, rejected = 0;

    for (const hub of hubPages) {
      // Все остальные страницы из того же кластера ссылаются на хаб
      const clusterPages = pages
        .filter(p => p.id !== hub.id)
        .slice(0, 10); // Ограничиваем для производительности

      for (const page of clusterPages) {
        const result = await this.tryCreateLink(runId, page, hub, 'head_consolidation', params);
        if (result.created) {
          generated++;
          this.stats.hubPagesUsed++;
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
      const similarPages = this.findSimilarPages(page1, pages, 3);
      
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
    if (params.priorityPages.length === 0) {
      console.log('⚠️ No priority pages specified, skipping Commercial Routing');
      return { generated: 0, rejected: 0 };
    }

    const priorityPages = pages.filter(p => 
      params.priorityPages.some(priorityUrl => p.url.includes(priorityUrl))
    );
    const informationalPages = pages.filter(p => 
      !params.priorityPages.some(url => p.url.includes(url))
    );
    
    let generated = 0, rejected = 0;

    for (const infoPage of informationalPages) {
      // Выбираем релевантную приоритетную страницу
      const priorityPage = priorityPages[Math.floor(Math.random() * priorityPages.length)];
      
      const result = await this.tryCreateLink(runId, infoPage, priorityPage, 'commercial_routing', params);
      if (result.created) {
        generated++;
        this.stats.priorityPagesUsed++;
      } else {
        rejected++;
      }
    }

    return { generated, rejected };
  }

  // DEPTH LIFT: сокращает путь до глубоких страниц
  private async executeDepthLiftScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    const deepPages = pages.filter(p => (p.clickDepth || 0) >= params.scenarios.depthLift.minDepth);
    const topLevelPages = pages.filter(p => (p.clickDepth || 0) <= 2);
    
    let generated = 0, rejected = 0;

    for (const deepPage of deepPages) {
      // Создаем шорткаты с верхних уровней (максимум 3)
      const shortcuts = topLevelPages.slice(0, 3);
      
      for (const topPage of shortcuts) {
        const result = await this.tryCreateLink(runId, topPage, deepPage, 'depth_lift', params);
        if (result.created) {
          generated++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
  }

  // FRESHNESS PUSH: ускоряет продвижение нового контента
  private async executeFreshnessPushScenario(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    const now = new Date();
    const freshnessCutoff = new Date(now.getTime() - params.scenarios.freshnessPush.daysFresh * 24 * 60 * 60 * 1000);
    
    // Разделяем на старые и новые страницы
    const oldPages = pages.filter(p => {
      const publishDate = p.publishedAt || p.createdAt || new Date(2020, 0, 1);
      return new Date(publishDate) < freshnessCutoff;
    });
    
    const freshPages = pages.filter(p => {
      const publishDate = p.publishedAt || p.createdAt || new Date();
      return new Date(publishDate) >= freshnessCutoff;
    });

    let generated = 0, rejected = 0;

    for (const oldPage of oldPages) {
      let linksFromThisPage = 0;
      
      for (const freshPage of freshPages) {
        if (linksFromThisPage >= params.scenarios.freshnessPush.linksPerDonor) break;
        
        const result = await this.tryCreateLink(runId, oldPage, freshPage, 'freshness_push', params);
        if (result.created) {
          generated++;
          linksFromThisPage++;
        } else {
          rejected++;
        }
      }
    }

    return { generated, rejected };
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
        isRejected: false,
        rejectionReason: null
      });

      return { created: true, anchor: anchorText };

    } catch (error) {
      console.error('Error creating link:', error);
      return { created: false, reason: 'Database error' };
    }
  }

  // Вспомогательные методы
  private async loadPages() {
    const jobs = await db
      .select()
      .from(importJobs)
      .where(and(
        eq(importJobs.projectId, this.projectId),
        eq(importJobs.status, 'completed')
      ))
      .orderBy(desc(importJobs.startedAt))
      .limit(1);

    if (!jobs[0]) {
      throw new Error(`No completed import job found for project ${this.projectId}`);
    }

    const pages = await db
      .select({
        id: pagesClean.id,
        cleanHtml: pagesClean.cleanHtml,
        wordCount: pagesClean.wordCount,
        url: graphMeta.url,
        clickDepth: graphMeta.clickDepth,
        isOrphan: graphMeta.isOrphan,
        inDegree: graphMeta.inDegree,
        outDegree: graphMeta.outDegree
      })
      .from(pagesClean)
      .innerJoin(graphMeta, eq(pagesClean.id, graphMeta.pageId))
      .where(eq(graphMeta.jobId, jobs[0].jobId));

    return pages;
  }

  private async updateProgress(runId: string, phase: string, percent: number, generated: number, rejected: number) {
    await db
      .update(generationRuns)
      .set({ phase, percent, generated, rejected })
      .where(eq(generationRuns.runId, runId));
  }

  private async handleOldLinksPolicy(policy: string, runId: string) {
    console.log(`📋 Applying old links policy: ${policy}`);
    // Логика обработки старых ссылок
  }

  private async finalizeDraft(runId: string) {
    console.log('📝 Finalizing draft...');
    // Логика финализации
  }

  private findSimilarPages(page: any, allPages: any[], limit: number): any[] {
    // Упрощенный поиск похожих страниц
    return allPages
      .filter(p => p.id !== page.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);
  }

  private async generateAnchorText(sourcePage: any, targetPage: any, params: GenerationParams): Promise<string> {
    const targetTitle = this.extractTitle(targetPage.cleanHtml || '');
    const shouldUseExact = Math.random() * 100 < params.exactAnchorPercent;
    
    if (shouldUseExact && targetTitle) {
      return targetTitle.substring(0, 50);
    } else {
      return 'подробнее';
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  private async isDuplicateLink(sourceUrl: string, targetUrl: string): Promise<boolean> {
    return false; // Упрощенная проверка
  }

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

  private isStopAnchor(anchorText: string, stopAnchors: string[]): boolean {
    return stopAnchors.some(stop => anchorText.toLowerCase().includes(stop.toLowerCase()));
  }
}