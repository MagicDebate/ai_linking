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
    // Initialize OpenAI with fallback
    try {
      this.openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY_2 || process.env.OPENAI_API_KEY 
      });
      console.log('OpenAI connection successful');
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

      // Phase 3: Generate Candidates (70-80%)
      await this.updateProgress(runId, 'generating', 75, 0, 0);
      const { generated, rejected } = await this.generateCandidates(runId, pages, params);
      
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
      .limit(50); // Limit for stability

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

  private async generateCandidates(runId: string, pages: any[], params: GenerationParams) {
    let generated = 0;
    let rejected = 0;

    const scenarios = params.scenarios;
    const rules = params.rules;

    // Limit combinations for stability
    const limitedPages = pages.slice(0, 20);

    for (const sourcePage of limitedPages) {
      for (const targetPage of limitedPages) {
        if (sourcePage.id === targetPage.id) continue;

        // Determine if this link should be generated
        const shouldGenerate = this.shouldGenerateLink(sourcePage, targetPage, scenarios, rules);
        
        if (!shouldGenerate.generate) continue;

        // Generate simple anchor text
        const anchorText = this.generateSimpleAnchorText(sourcePage, targetPage);
        
        // Check constraints
        const violation = await this.checkConstraints(runId, sourcePage, targetPage, anchorText, rules);
        
        if (violation) {
          rejected++;
          await db
            .insert(linkCandidates)
            .values({
              runId,
              sourcePageId: sourcePage.id,
              targetPageId: targetPage.id,
              sourceUrl: sourcePage.url,
              targetUrl: targetPage.url,
              anchorText,
              scenario: shouldGenerate.scenario,
              position: 0,
              isRejected: true,
              rejectionReason: violation,
              cssClass: rules.cssClass,
              relAttribute: rules.relAttribute,
              targetAttribute: rules.targetAttribute
            });
        } else {
          generated++;
          await db
            .insert(linkCandidates)
            .values({
              runId,
              sourcePageId: sourcePage.id,
              targetPageId: targetPage.id,
              sourceUrl: sourcePage.url,
              targetUrl: targetPage.url,
              anchorText,
              scenario: shouldGenerate.scenario,
              position: 0,
              cssClass: rules.cssClass,
              relAttribute: rules.relAttribute,
              targetAttribute: rules.targetAttribute
            });
        }
      }
    }

    return { generated, rejected };
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
      .replace(/\.[^/.]+$/, '')
      .substring(0, 50);
    
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