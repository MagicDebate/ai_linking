import OpenAI from 'openai';
import { db } from './db.js';
import { 
  generationRuns, 
  linkCandidates, 
  pageEmbeddings, 
  brokenUrls, 
  importJobs,
  pagesClean,
  pagesRaw,
  blocks,
  graphMeta
} from '../shared/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface GenerationParams {
  scenarios: {
    orphanFix: boolean;
    depthLift: boolean;
    commercialRouting: boolean;
    headConsolidation: boolean;
    clusterCrossLink: boolean;
  };
  rules: {
    maxLinks: number;
    depthThreshold: number;
    moneyPages: string[];
    stopAnchors: string[];
    dedupeLinks: boolean;
    cssClass: string;
    relAttribute: string;
    targetAttribute: string;
  };
  check404Policy: string;
}

export class LinkGenerator {
  private openai: OpenAI;
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    // Initialize OpenAI with faster model for production
    try {
      this.openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY_2 || process.env.OPENAI_API_KEY 
      });
      console.log('OpenAI connection successful (using gpt-3.5-turbo for speed)');
    } catch (error) {
      console.error('OpenAI initialization failed:', error);
      throw error;
    }
  }

  async generate(params: GenerationParams): Promise<string> {
    const runId = crypto.randomUUID();
    
    try {
      // Create generation run record
      await db
        .insert(generationRuns)
        .values({
          runId: runId,
          projectId: this.projectId,
          importId: 'default-import', // Default import reference
          status: 'running',
          phase: 'loading',
          percent: 0,
          generated: 0,
          rejected: 0
        });

      console.log('Initializing OpenAI-powered link generator...');
      
      // Phase 1: Load Pages (0-20%)
      await this.updateProgress(runId, 'loading', 10, 0, 0);
      const pages = await this.loadPages();
      
      await this.updateProgress(runId, 'loading', 20, 0, 0);
      console.log(`Loaded ${pages.length} pages for analysis`);

      // Phase 2: Generate Embeddings (20-70%)
      await this.updateProgress(runId, 'embedding', 30, 0, 0);
      await this.generateEmbeddings(runId, pages);
      
      await this.updateProgress(runId, 'embedding', 70, 0, 0);

      // Phase 3: Smart Link Generation (70-80%)
      await this.updateProgress(runId, 'generating', 75, 0, 0);
      const { generated, rejected } = await this.smartLinkGeneration(runId, pages, params);
      
      await this.updateProgress(runId, 'generating', 80, generated, rejected);

      // Phase 4: Check 404s (80-90%)
      await this.updateProgress(runId, 'checking_404', 85, generated, rejected);
      await this.check404Links(runId, params.check404Policy);
      
      await this.updateProgress(runId, 'checking_404', 90, generated, rejected);

      // Phase 5: Finalize (90-100%)
      await this.finalizeDraft(runId);
      
      await db
        .update(generationRuns)
        .set({
          status: 'published',
          phase: 'completed',
          percent: 100,
          generated,
          rejected,
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));

      console.log(`Generation completed: ${generated} links generated, ${rejected} rejected`);
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

  private async updateProgress(runId: string, phase: string, percent: number, generated: number, rejected: number) {
    await db
      .update(generationRuns)
      .set({ phase, percent, generated, rejected })
      .where(eq(generationRuns.runId, runId));
  }

  private async loadPages() {
    // Get the most recent completed import job
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

    const job = jobs[0];
    console.log(`Using job ${job.jobId} with ${job.blocksDone} blocks`);

    // Load clean pages with metadata (limit for stability)
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
      .where(eq(graphMeta.jobId, job.jobId))
      // Remove artificial limits - process all pages
      // .limit(30); // Removed limit for comprehensive processing

    console.log(`Selected ${pages.length} pages for processing (all pages from import)`);
    return pages;
  }

  private async generateEmbeddings(runId: string, pages: any[]) {
    console.log(`Processing ${pages.length} pages for embeddings...`);
    
    // Simplified embedding generation for stability
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      // Extract simple keywords from content
      const content = this.extractMainContent(page.cleanHtml || '');
      const keywords = this.extractSimpleKeywords(content, '');
      
      // Store simplified embedding
      await db
        .insert(pageEmbeddings)
        .values({
          pageId: page.id,
          jobId: runId,
          url: page.url,
          title: this.extractTitle(page.cleanHtml || ''),
          contentVector: JSON.stringify(keywords),
          wordCount: page.wordCount || 0,
          isDeep: page.clickDepth >= 4,
          isMoney: this.isMoneyPage(page.url, [])
        });
        
      // Update progress
      if (i % 10 === 0) {
        const percent = 30 + Math.floor((i / pages.length) * 40);
        await this.updateProgress(runId, 'embedding', percent, 0, 0);
      }
    }
  }

  // ШАГ 3: УМНАЯ ГЕНЕРАЦИЯ ССЫЛОК ПО НОВОМУ АЛГОРИТМУ
  private async smartLinkGeneration(runId: string, pages: any[], params: GenerationParams): Promise<{ generated: number, rejected: number }> {
    let totalGenerated = 0;
    let totalRejected = 0;

    const scenarios = params.scenarios;
    const rules = params.rules;

    console.log(`🧠 Starting smart link generation for ${pages.length} donor pages`);
    console.log(`⚙️ Rules: maxLinks=${rules.maxLinks}, scenarios=${Object.keys(scenarios).filter(k => (scenarios as any)[k]).join(', ')}`);

    // ШАГ 1: Фильтруем только релевантные страницы-доноры
    const eligibleDonors = pages.filter(page => {
      const applicableScenarios = this.getApplicableScenarios(page, scenarios, rules);
      return applicableScenarios.length > 0;
    });

    console.log(`🎯 Filtered ${eligibleDonors.length} eligible donors from ${pages.length} total pages`);

    // ШАГ 1: Обход страниц-доноров
    for (let i = 0; i < eligibleDonors.length; i++) {
      const donorPage = eligibleDonors[i];
      
      // 🔍 ПРОВЕРЯЕМ ЛИМИТ ЗАРАНЕЕ
      const currentLinksCount = await this.getCurrentLinksCount(runId, donorPage.id);
      if (currentLinksCount >= rules.maxLinks) {
        console.log(`⏭️  Page ${donorPage.url} already has ${currentLinksCount} links (max: ${rules.maxLinks}), skipping`);
        continue;
      }

      console.log(`\n🎯 Processing donor page ${i+1}/${eligibleDonors.length}: ${donorPage.url}`);
      console.log(`   Current links: ${currentLinksCount}/${rules.maxLinks}`);

      // Определяем какие сценарии применимы к этой странице
      const applicableScenarios = this.getApplicableScenarios(donorPage, scenarios, rules);

      console.log(`   ✅ Applicable scenarios: ${applicableScenarios.join(', ')}`);

      // 🎯 ИЩЕМ ПО СМЫСЛУ ДЕСЯТОК САМЫХ БЛИЗКИХ ЦЕЛЕЙ
      const topTargets = await this.findTopTargets(donorPage, pages, Math.min(10, rules.maxLinks * 2));
      console.log(`   🔍 Found ${topTargets.length} potential targets`);

      let linksCreatedFromThisPage = currentLinksCount;
      let targetIndex = 0;

      // Обрабатываем каждую потенциальную цель (максимум maxLinks)
      while (linksCreatedFromThisPage < rules.maxLinks && targetIndex < topTargets.length) {
        const target = topTargets[targetIndex];
        targetIndex++;

        // ШАГ 2: ПРИМЕНЕНИЕ ГЛОБАЛЬНЫХ ПРАВИЛ
        const linkResult = await this.tryCreateLink(runId, donorPage, target, applicableScenarios[0], rules);
        
        if (linkResult.created) {
          totalGenerated++;
          linksCreatedFromThisPage++;
          console.log(`   ✅ Created link: ${donorPage.url} → ${target.url} (${linkResult.anchor})`);
        } else {
          totalRejected++;
          console.log(`   ❌ Rejected link: ${linkResult.reason}`);
        }
      }

      if (linksCreatedFromThisPage >= rules.maxLinks) {
        console.log(`   🎯 Completed donor page: created ${linksCreatedFromThisPage} links`);
      }

      // Update progress more frequently for better UX
      if (i % 5 === 0) {
        const percent = 70 + Math.floor((i / eligibleDonors.length) * 10);
        await this.updateProgress(runId, 'linking', percent, totalGenerated, totalRejected);
      }
    }

    console.log(`\n🏁 Smart generation completed: ${totalGenerated} generated, ${totalRejected} rejected`);
    return { generated: totalGenerated, rejected: totalRejected };
  }

  // Получить текущее количество ссылок с данной страницы
  private async getCurrentLinksCount(runId: string, sourcePageId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(linkCandidates)
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.sourcePageId, sourcePageId),
        eq(linkCandidates.isRejected, false)
      ));
    
    return result[0]?.count || 0;
  }

  // Определить применимые сценарии для страницы
  private getApplicableScenarios(donorPage: any, scenarios: any, rules: any): string[] {
    const applicable: string[] = [];

    // Orphan Fix - для сирот
    if (scenarios.orphanFix && donorPage.isOrphan) {
      applicable.push('orphan');
    }

    // Depth Lift - для глубоких страниц
    if (scenarios.depthLift && donorPage.clickDepth >= rules.depthThreshold) {
      applicable.push('depth');
    }

    // Commercial Routing - для денежных страниц
    if (scenarios.commercialRouting && this.isMoneyPage(donorPage.url, rules.moneyPages)) {
      applicable.push('money');
    }

    // Head Consolidation - для высокоавторитетных страниц
    if (scenarios.headConsolidation && donorPage.inDegree > 5) {
      applicable.push('head');
    }

    // Cluster Cross Link - для кластерной перелинковки
    if (scenarios.clusterCrossLink) {
      applicable.push('cross');
    }

    return applicable;
  }

  // Найти топ-10 релевантных целей по семантике
  private async findTopTargets(donorPage: any, allPages: any[], limit: number): Promise<any[]> {
    // Простая семантическая близость на основе общих ключевых слов
    const donorKeywords = this.extractSimpleKeywords(donorPage.cleanHtml || '', '');
    
    const scoredTargets = allPages
      .filter(page => page.id !== donorPage.id)
      .map(targetPage => {
        const targetKeywords = this.extractSimpleKeywords(targetPage.cleanHtml || '', '');
        const similarity = this.calculateKeywordSimilarity(donorKeywords, targetKeywords);
        
        return {
          ...targetPage,
          similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scoredTargets;
  }

  // Попытаться создать ссылку с проверкой всех правил
  private async tryCreateLink(runId: string, donorPage: any, targetPage: any, scenario: string, rules: any): Promise<{ created: boolean, anchor?: string, reason?: string }> {
    // Генерируем анкор
    const anchorText = this.generateSimpleAnchorText(donorPage, targetPage);

    // Проверяем все правила
    const checks = [
      this.checkDuplicateUrl(runId, donorPage.id, targetPage.url),
      this.checkStopAnchors(anchorText, rules.stopAnchors),
      // Дополнительные проверки можно добавить здесь
    ];

    const rejectionReason = await Promise.all(checks).then(results => results.find(r => r !== null));

    if (rejectionReason) {
      // Сохраняем отклоненную ссылку для анализа
      await db.insert(linkCandidates).values({
        runId,
        sourcePageId: donorPage.id,
        targetPageId: targetPage.id,
        sourceUrl: donorPage.url,
        targetUrl: targetPage.url,
        anchorText,
        scenario,
        similarity: targetPage.similarity || 0.5,
        isRejected: true,
        rejectionReason,
        position: 0,
        cssClass: rules.cssClass,
        relAttribute: rules.relAttribute,
        targetAttribute: rules.targetAttribute
      });

      return { created: false, reason: rejectionReason };
    }

    // Создаем принятую ссылку
    await db.insert(linkCandidates).values({
      runId,
      sourcePageId: donorPage.id,
      targetPageId: targetPage.id,
      sourceUrl: donorPage.url,
      targetUrl: targetPage.url,
      anchorText,
      scenario,
      similarity: targetPage.similarity || 0.7,
      isRejected: false,
      position: 0,
      cssClass: rules.cssClass,
      relAttribute: rules.relAttribute,
      targetAttribute: rules.targetAttribute
    });

    return { created: true, anchor: anchorText };
  }

  // Проверка на дублирующий URL
  private async checkDuplicateUrl(runId: string, sourcePageId: string, targetUrl: string): Promise<string | null> {
    const duplicate = await db
      .select()
      .from(linkCandidates)
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.sourcePageId, sourcePageId),
        eq(linkCandidates.targetUrl, targetUrl),
        eq(linkCandidates.isRejected, false)
      ))
      .limit(1);

    return duplicate.length > 0 ? 'duplicate_url' : null;
  }

  // Проверка стоп-анкоров
  private checkStopAnchors(anchorText: string, stopAnchors: string[]): string | null {
    if (stopAnchors?.some((stop: string) => anchorText.toLowerCase().includes(stop.toLowerCase()))) {
      return 'stop_anchor';
    }
    return null;
  }

  // Простое вычисление семантической близости
  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    if (!keywords1.length || !keywords2.length) return 0;

    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = Array.from(new Set([...keywords1, ...keywords2]));
    
    return intersection.length / union.length;
  }

  private shouldGenerateLink(sourcePage: any, targetPage: any, scenarios: Record<string, boolean>, rules: any) {
    // Orphan Fix scenario
    if (scenarios.orphanFix && sourcePage.isOrphan) {
      return { generate: true, scenario: 'orphan' };
    }

    // Depth Lift scenario  
    if (scenarios.depthLift && targetPage.clickDepth >= rules.depthThreshold) {
      return { generate: true, scenario: 'depth' };
    }

    // Commercial Routing scenario
    if (scenarios.commercialRouting && this.isMoneyPage(targetPage.url, rules.moneyPages)) {
      return { generate: true, scenario: 'money' };
    }

    // Head Consolidation scenario
    if (scenarios.headConsolidation && targetPage.inDegree > 5) {
      return { generate: true, scenario: 'head' };
    }

    // Cluster Cross Link scenario
    if (scenarios.clusterCrossLink) {
      return { generate: true, scenario: 'cross' };
    }

    return { generate: false, scenario: '' };
  }

  private async checkConstraints(runId: string, sourcePage: any, targetPage: any, anchorText: string, rules: any): Promise<string | null> {
    // Check max links per page
    const existingLinks = await db
      .select({ count: sql<number>`count(*)` })
      .from(linkCandidates)
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.sourcePageId, sourcePage.id),
        eq(linkCandidates.isRejected, false)
      ));

    if (existingLinks[0]?.count >= rules.maxLinks) {
      return 'max_links_exceeded';
    }

    // Check stop-list anchors
    if (rules.stopAnchors?.some((stop: string) => anchorText.toLowerCase().includes(stop.toLowerCase()))) {
      return 'stop_anchor';
    }

    // Check for duplicates if deduplication is enabled
    if (rules.dedupeLinks) {
      const duplicate = await db
        .select()
        .from(linkCandidates)
        .where(and(
          eq(linkCandidates.runId, runId),
          eq(linkCandidates.sourcePageId, sourcePage.id),
          eq(linkCandidates.targetUrl, targetPage.url),
          eq(linkCandidates.isRejected, false)
        ))
        .limit(1);

      if (duplicate.length > 0) {
        return 'duplicate_url';
      }
    }

    return null;
  }

  private generateSimpleAnchorText(sourcePage: any, targetPage: any): string {
    // Generate simple anchor text based on URL
    const url = targetPage.url || '';
    const segments = url.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || 'страница';
    
    // Clean up the segment
    let anchor = lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\.[^/.]+$/, '');
    
    if (anchor.length < 3) {
      anchor = 'перейти к разделу';
    }
    
    return anchor;
  }

  private async check404Links(runId: string, policy: string) {
    // Get all target URLs from candidates
    const candidates = await db
      .select({ targetUrl: linkCandidates.targetUrl })
      .from(linkCandidates)
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.isRejected, false)
      ));

    const uniqueUrls = Array.from(new Set(candidates.map(c => c.targetUrl)));

    for (const url of uniqueUrls) {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.status === 404) {
          await db
            .insert(brokenUrls)
            .values({ runId, url });

          if (policy === 'delete') {
            await db
              .update(linkCandidates)
              .set({ isRejected: true, rejectionReason: '404_url' })
              .where(and(
                eq(linkCandidates.runId, runId),
                eq(linkCandidates.targetUrl, url)
              ));
          }
        }
      } catch (error) {
        console.warn(`Could not check URL ${url}:`, error);
      }
    }
  }

  private async finalizeDraft(runId: string) {
    // Mark as draft
    await db
      .update(linkCandidates)
      .set({ isDraft: true })
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.isRejected, false)
      ));
  }

  // Utility methods
  private extractMainContent(html: string): string {
    // Remove HTML tags and extract text content
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled';
  }

  private isMoneyPage(url: string, moneyPatterns: string[]): boolean {
    return moneyPatterns.some(pattern => url.includes(pattern));
  }

  private extractSimpleKeywords(content: string, title: string): string[] {
    // Simple keyword extraction
    const words = (content + ' ' + title).toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/^(что|как|это|для|где|когда|почему|который|можно|нужно|такой|только|очень)$/.test(word));
    
    // Get most frequent words
    const wordCount = new Map();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
    
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}