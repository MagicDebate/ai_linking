import { db } from './db';
import { 
  generationRuns, 
  linkCandidates, 
  pageEmbeddings, 
  pagesClean,
  brokenUrls,
  importJobs,
  graphMeta
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import * as tf from '@tensorflow/tfjs-node';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import { randomUUID } from 'crypto';

interface GenerationParams {
  projectId: string;
  importId: string;
  scenarios: Record<string, boolean>;
  rules: any;
  scope: any;
}

interface ProgressUpdate {
  runId: string;
  phase: string;
  percent: number;
  generated: number;
  rejected: number;
}

export class LinkGenerator {
  private model: any;
  private progressCallback?: (update: ProgressUpdate) => void;

  constructor(progressCallback?: (update: ProgressUpdate) => void) {
    this.progressCallback = progressCallback;
  }

  async initialize() {
    console.log('Loading Sentence-BERT model...');
    this.model = await use.load();
    console.log('Model loaded successfully');
  }

  async generateLinks(params: GenerationParams): Promise<string> {
    // Generate unique run ID
    const runId = randomUUID();
    
    // Create new generation run
    const [run] = await db
      .insert(generationRuns)
      .values({
        runId: runId,
        projectId: params.projectId,
        importId: params.importId,
        status: 'running',
        phase: 'starting',
        scenarios: params.scenarios,
        rules: params.rules,
        scope: params.scope
      })
      .returning();

    try {
      await this.updateProgress(runId, 'starting', 0, 0, 0);

      // Initialize model if not loaded
      if (!this.model) {
        await this.initialize();
      }

      // Step 1: Load and analyze pages
      await this.updateProgress(runId, 'analyzing', 10, 0, 0);
      const pages = await this.loadPages(params.importId);
      
      // Step 2: Generate embeddings for similarity checks
      await this.updateProgress(runId, 'embedding', 30, 0, 0);
      await this.generateEmbeddings(runId, pages);

      // Step 3: Generate link candidates
      await this.updateProgress(runId, 'generating', 50, 0, 0);
      const { generated, rejected } = await this.generateCandidates(runId, pages, params);

      // Step 4: Check for 404s if needed
      if (params.rules.brokenLinksPolicy !== 'ignore') {
        await this.updateProgress(runId, 'checking_404', 80, generated, rejected);
        await this.check404Links(runId, params.rules.brokenLinksPolicy);
      }

      // Step 5: Finalize
      await this.updateProgress(runId, 'finalizing', 95, generated, rejected);
      await this.finalizeDraft(runId);

      await this.updateProgress(runId, 'completed', 100, generated, rejected);

      // Update status to draft
      await db
        .update(generationRuns)
        .set({ 
          status: 'draft', 
          finishedAt: new Date(),
          generated,
          rejected
        })
        .where(eq(generationRuns.runId, runId));

      return runId;

    } catch (error) {
      console.error('Generation failed:', error);
      await db
        .update(generationRuns)
        .set({ 
          status: 'failed', 
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
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

    if (this.progressCallback) {
      this.progressCallback({ runId, phase, percent, generated, rejected });
    }
  }

  private async loadPages(importId: string) {
    // Get the job for this import
    const [job] = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.importId, importId))
      .limit(1);

    if (!job) {
      throw new Error('Import job not found');
    }

    // Load clean pages with metadata
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
      .where(eq(graphMeta.jobId, job.jobId));

    return pages;
  }

  private async generateEmbeddings(runId: string, pages: any[]) {
    for (const page of pages) {
      // Extract main content for embedding
      const content = this.extractMainContent(page.cleanHtml);
      
      // Generate embedding
      const embeddings = await this.model.embed([content]);
      const vector = await embeddings.data();
      
      // Convert to array for the first text
      const vectorArray = Array.from(vector.slice(0, 384)); // Take first 384 dimensions
      
      // Check if page is "deep" based on rules
      const isDeep = page.clickDepth >= 4; // This should come from rules
      
      // Check if page is "money" based on URL patterns
      const isMoney = this.isMoneyPage(page.url, []); // This should come from rules
      
      await db
        .insert(pageEmbeddings)
        .values({
          pageId: page.id,
          jobId: runId, // Using runId as jobId for now
          url: page.url,
          title: this.extractTitle(page.cleanHtml),
          contentVector: vectorArray,
          wordCount: page.wordCount,
          isDeep,
          isMoney
        });
    }
  }

  private async generateCandidates(runId: string, pages: any[], params: GenerationParams) {
    let generated = 0;
    let rejected = 0;

    const scenarios = params.scenarios;
    const rules = params.rules;

    for (const sourcePage of pages) {
      for (const targetPage of pages) {
        if (sourcePage.id === targetPage.id) continue;

        // Determine if this link should be generated based on scenarios
        const shouldGenerate = this.shouldGenerateLink(sourcePage, targetPage, scenarios, rules);
        
        if (!shouldGenerate.generate) continue;

        // Generate anchor text
        const anchorText = this.generateAnchorText(targetPage);
        
        // Check all constraints
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
              position: 0, // This should be calculated from content
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
              position: 0, // This should be calculated from content
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

    // Check cannibalization similarity
    const similarity = await this.calculateSimilarity(sourcePage.id, targetPage.id);
    if (similarity > 0.8) { // High similarity threshold
      return 'cannibalization';
    }

    return null;
  }

  private async calculateSimilarity(pageId1: string, pageId2: string): Promise<number> {
    const embeddings = await db
      .select()
      .from(pageEmbeddings)
      .where(sql`page_id IN (${pageId1}, ${pageId2})`);

    if (embeddings.length !== 2) return 0;

    const vec1 = embeddings[0].contentVector;
    const vec2 = embeddings[1].contentVector;

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
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

    const uniqueUrls = [...new Set(candidates.map(c => c.targetUrl))];

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
    // Apply final HTML attributes and mark as draft
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

  private generateAnchorText(targetPage: any): string {
    // Simple anchor text generation - should be more sophisticated
    return this.extractTitle(targetPage.cleanHtml) || 'читать далее';
  }
}