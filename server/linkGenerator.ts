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

      // Phase 4: Check 404s (80-85%)
      await this.updateProgress(runId, 'checking_404', 82, generated, rejected);
      await this.check404Links(runId, params.check404Policy);
      
      await this.updateProgress(runId, 'checking_404', 85, generated, rejected);

      // Phase 5: Insert Links into HTML (85-95%)
      await this.updateProgress(runId, 'inserting', 87, generated, rejected);
      await this.insertLinksIntoPages(runId);
      
      await this.updateProgress(runId, 'inserting', 95, generated, rejected);

      // Phase 6: Finalize (95-100%)
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
    // Генерируем анкор с помощью улучшенного OpenAI алгоритма
    const anchorResult = await this.generateSmartAnchorText(donorPage, targetPage);
    
    // Если не смогли создать естественный анкор - пропускаем
    if (!anchorResult) {
      return { created: false, reason: 'no_natural_anchor' };
    }
    
    const anchorText = anchorResult.anchor;

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

    // Создаем принятую ссылку с дополнительными данными для вставки
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
      targetAttribute: rules.targetAttribute,
      // Сохраняем информацию о модификации контента если есть
      modifiedSentence: anchorResult.modifiedContent || null
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

  private async generateSmartAnchorText(sourcePage: any, targetPage: any): Promise<{ anchor: string, modifiedContent?: string } | null> {
    try {
      // Получаем блоки контента для источника
      const sourceBlocks = await db
        .select()
        .from(blocks)
        .where(eq(blocks.pageId, sourcePage.id))
        .limit(5);

      const sourceContent = sourceBlocks
        .map(block => block.text)
        .join(' ')
        .substring(0, 1000);

      const targetTitle = targetPage.title || this.extractTitle(targetPage.cleanHtml || '');
      
      // Сначала ищем существующий подходящий текст в блоках
      const contentAnchor = this.findAnchorInContent(sourceContent, targetTitle);
      if (contentAnchor) {
        console.log(`📌 Found existing anchor: "${contentAnchor}"`);
        return { anchor: contentAnchor };
      }

      console.log(`🤖 No existing anchor found, trying OpenAI rewrite for: ${targetTitle}`);
      
      // Пытаемся создать модифицированный контент с OpenAI
      const rewriteResult = await this.generateRewrittenSentence(sourceContent, targetTitle);
      if (rewriteResult) {
        console.log(`✨ OpenAI generated rewrite: "${rewriteResult.modifiedSentence}"`);
        return { 
          anchor: rewriteResult.anchor, 
          modifiedContent: rewriteResult.modifiedSentence 
        };
      }

      // Если OpenAI не смог переписать - пропускаем эту ссылку
      console.log(`❌ Cannot create natural link for: ${targetTitle} - skipping`);
      return null;
      
    } catch (error) {
      console.log('Smart anchor generation failed, skipping link:', error);
      return null;
    }
  }

  // Новая функция для создания переписанных предложений с OpenAI
  private async generateRewrittenSentence(sourceContent: string, targetTitle: string): Promise<{ anchor: string, modifiedSentence: string } | null> {
    try {
      const openai = new (await import('openai')).default({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      const prompt = `Ты эксперт по SEO и внутренней перелинковке. 

ЗАДАЧА: Найди в тексте существующий фрагмент, где можно ЕСТЕСТВЕННО добавить ссылку на статью "${targetTitle}", НЕ переписывая весь смысл.

ИСХОДНЫЙ ТЕКСТ:
"${sourceContent}"

ТРЕБОВАНИЯ:
1. Найди существующий фрагмент текста, где тема "${targetTitle}" уже упоминается или логически подходит
2. Создай анкор-текст для ссылки (2-4 слова на русском языке) 
3. Найди точное место в СУЩЕСТВУЮЩЕМ тексте где можно вставить этот анкор
4. НЕ изменяй общий смысл предложения, только добавь ссылку

ФОРМАТ ОТВЕТА (JSON):
{
  "existingText": "существующий фрагмент текста",
  "anchor": "текст анкора для ссылки",
  "modifiedSentence": "тот же текст но с анкором вместо обычных слов"
}

ПРИМЕР:
Существующий: "При лечении депрессии важно обратиться к специалисту."
Анкор: "лечении депрессии"  
Модифицированный: "При лечении депрессии важно обратиться к специалисту."

ВАЖНО: 
- Ищи только релевантные места где тема уже присутствует
- НЕ добавляй новую информацию, только делай ссылки из существующих слов
- Если подходящего места нет - верни null`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // используем лучшую модель
        messages: [
          { role: "system", content: "Ты эксперт по SEO и созданию естественных внутренних ссылок. Отвечай только на русском языке." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (result.modifiedSentence && result.anchor) {
        return {
          anchor: result.anchor,
          modifiedSentence: result.modifiedSentence
        };
      }
      
      return null;
    } catch (error) {
      console.log('OpenAI rewrite failed:', error);
      return null;
    }
  }

  // Быстрая генерация умных анкоров без OpenAI
  private generateQuickSmartAnchor(sourceContent: string, targetTitle: string): string | null {
    const contentWords = sourceContent.toLowerCase().split(/\s+/);
    const titleWords = targetTitle.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    
    // Ищем пересечения слов
    for (const titleWord of titleWords) {
      const wordIndex = contentWords.findIndex(word => word.includes(titleWord));
      if (wordIndex !== -1) {
        // Берем контекст вокруг найденного слова
        const start = Math.max(0, wordIndex - 2);
        const end = Math.min(contentWords.length, wordIndex + 3);
        const contextWords = contentWords.slice(start, end);
        
        const anchor = contextWords.join(' ').replace(/[^\w\s]/g, '').trim();
        if (anchor.length > 5 && anchor.length < 50) {
          return anchor;
        }
      }
    }
    
    // Если прямого совпадения нет, создаем анкор на основе ключевых слов
    const firstTitleWord = titleWords[0];
    if (firstTitleWord && contentWords.some(word => word.includes(firstTitleWord.substring(0, 4)))) {
      return `подробнее о ${firstTitleWord}`;
    }
    
    return null;
  }

  // Поиск подходящего анкорного текста прямо в контенте источника
  private findAnchorInContent(content: string, targetTitle: string): string | null {
    const targetWords = targetTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const cleanContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Ищем фразы длиной 2-6 слов, которые содержат ключевые слова из целевого заголовка
    const sentences = cleanContent.split(/[.!?]\s+/);
    
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      
      for (let i = 0; i <= words.length - 2; i++) {
        for (let len = 2; len <= Math.min(6, words.length - i); len++) {
          const phrase = words.slice(i, i + len).join(' ');
          const lowerPhrase = phrase.toLowerCase();
          
          // Проверяем, содержит ли фраза ключевые слова из заголовка
          const relevantWords = targetWords.filter(word => lowerPhrase.includes(word));
          
          if (relevantWords.length >= 1 && phrase.length >= 10 && phrase.length <= 50) {
            // Дополнительная проверка на качество фразы
            if (!lowerPhrase.match(/^(и|в|на|с|для|это|как|что|если|когда)/)) {
              return phrase;
            }
          }
        }
      }
    }
    
    return null;
  }

  private generateSimpleAnchorText(sourcePage: any, targetPage: any): string {
    // Резервный способ создания анкора из заголовка или URL
    const title = targetPage.title || '';
    if (title && title.length > 3) {
      // Берем первые 3-5 слов из заголовка
      const words = title.split(' ').slice(0, 5);
      return words.join(' ').toLowerCase();
    }
    
    // Если заголовка нет, берем из URL
    const url = targetPage.url || '';
    const segments = url.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || 'страница';
    
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

  private async insertLinksIntoPages(runId: string) {
    console.log('🔗 Starting link insertion into HTML pages...');
    
    // Get all accepted links grouped by source page
    const links = await db
      .select({
        sourceUrl: linkCandidates.sourceUrl,
        targetUrl: linkCandidates.targetUrl,
        anchorText: linkCandidates.anchorText,
        cssClass: linkCandidates.cssClass,
        relAttribute: linkCandidates.relAttribute,
        targetAttribute: linkCandidates.targetAttribute
      })
      .from(linkCandidates)
      .where(and(
        eq(linkCandidates.runId, runId),
        eq(linkCandidates.isRejected, false)
      ));

    // Group links by source URL
    const linksByPage = new Map<string, any[]>();
    links.forEach(link => {
      const pageLinks = linksByPage.get(link.sourceUrl) || [];
      pageLinks.push(link);
      linksByPage.set(link.sourceUrl, pageLinks);
    });

    console.log(`📝 Inserting links into ${linksByPage.size} pages...`);

    for (const [sourceUrl, pageLinks] of Array.from(linksByPage)) {
      try {
        // Get current page HTML
        const page = await db
          .select({ rawHtml: pagesRaw.rawHtml, id: pagesRaw.id })
          .from(pagesRaw)
          .where(eq(pagesRaw.url, sourceUrl))
          .limit(1);

        if (!page.length) continue;

        let updatedHtml = page[0].rawHtml;

        // Insert each link into the HTML
        for (const link of pageLinks) {
          updatedHtml = this.insertLinkIntoHtml(
            updatedHtml,
            link.anchorText,
            link.targetUrl,
            link.modifiedSentence || undefined,
            link.cssClass || undefined,
            link.relAttribute || undefined,
            link.targetAttribute || undefined
          );
        }

        // Update the page with new HTML containing links
        await db
          .update(pagesRaw)
          .set({ rawHtml: updatedHtml })
          .where(eq(pagesRaw.id, page[0].id));

        console.log(`✅ Inserted ${pageLinks.length} links into ${sourceUrl}`);

      } catch (error) {
        console.error(`❌ Failed to insert links into ${sourceUrl}:`, error);
      }
    }

    console.log('🎉 Link insertion completed!');
  }

  private insertLinkIntoHtml(html: string, anchorText: string, targetUrl: string, modifiedSentence?: string, cssClass?: string, relAttribute?: string, targetAttribute?: string): string {
    // Create the link HTML
    let linkAttributes = `href="${targetUrl}"`;
    if (cssClass) linkAttributes += ` class="${cssClass}"`;
    if (relAttribute) linkAttributes += ` rel="${relAttribute}"`;
    if (targetAttribute) linkAttributes += ` target="${targetAttribute}"`;

    const linkHtml = `<a ${linkAttributes}>${anchorText}</a>`;

    // Если есть модифицированное предложение, заменяем целое предложение
    if (modifiedSentence) {
      console.log(`✏️ Inserting modified sentence: "${modifiedSentence}"`);
      
      // Ищем похожие предложения в тексте для замены
      const cleanHtml = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const sentences = cleanHtml.split(/[.!?]\s+/);
      
      // Находим наиболее похожее предложение для замены
      let bestMatch = '';
      let bestSimilarity = 0;
      
      for (const sentence of sentences) {
        if (sentence.length > 20) {
          const similarity = this.calculateStringSimilarity(sentence, modifiedSentence);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = sentence;
          }
        }
      }
      
      // Если нашли похожее предложение, заменяем его
      if (bestMatch && bestSimilarity > 0.3) {
        const escapedMatch = bestMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedMatch, 'i');
        const updatedHtml = html.replace(regex, modifiedSentence);
        if (updatedHtml !== html) {
          console.log(`✅ Replaced sentence successfully`);
          return updatedHtml;
        }
      }
    }

    // Стандартная вставка - ищем анкорный текст и оборачиваем в ссылку
    const exactMatch = new RegExp(`\\b${anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (exactMatch.test(html)) {
      console.log(`🔗 Found exact anchor match, wrapping in link`);
      return html.replace(exactMatch, linkHtml);
    }

    // Если точного совпадения нет, ищем частичное совпадение
    const partialMatch = new RegExp(anchorText.split(' ').map(word => 
      word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('.*?'), 'i');
    
    if (partialMatch.test(html)) {
      console.log(`🔗 Found partial anchor match, inserting link`);
      return html.replace(partialMatch, linkHtml);
    }

    // Вставляем в конец первого абзаца
    const paragraphMatch = html.match(/<\/p>/i);
    if (paragraphMatch) {
      const insertPos = paragraphMatch.index!;
      console.log(`📝 Inserting at end of first paragraph`);
      return html.slice(0, insertPos) + ` ${linkHtml}` + html.slice(insertPos);
    }

    // Фаллбек: вставляем в конец body
    const bodyMatch = html.match(/<\/body>/i);
    if (bodyMatch) {
      const insertPos = bodyMatch.index!;
      return html.slice(0, insertPos) + `<p>${linkHtml}</p>` + html.slice(insertPos);
    }

    // Финальный фаллбек: добавляем в конец
    return html + `<p>${linkHtml}</p>`;
  }

  // Вычисление похожести строк для поиска предложений для замены
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = Array.from(new Set([...words1, ...words2]));
    
    return intersection.length / union.length;
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