import { 
  users, 
  projects, 
  userProgress, 
  notifications,
  projectApiKeys,
  imports,
  importJobs,
  pagesRaw,
  pagesClean,
  blocks,
  embeddings,
  edges,
  graphMeta,
  type User, 
  type InsertUser,
  type Project,
  type InsertProject,
  type UserProgress,
  type InsertProgress,
  type Notification,
  type InsertNotification,
  type ProjectApiKey,
  type InsertApiKey,
  type Import,
  type InsertImport
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// Global type declaration for import jobs
declare global {
  var importJobs: Map<string, any> | undefined;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  // Projects
  getProjects(userId: string): Promise<Project[]>;
  getProjectById(projectId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: string, userId: string): Promise<void>;
  
  // User Progress
  getUserProgress(userId: string): Promise<UserProgress | undefined>;
  updateUserProgress(userId: string, progress: Partial<InsertProgress>): Promise<UserProgress>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  dismissNotification(id: string, userId: string): Promise<void>;
  
  // API Keys
  getProjectApiKey(projectId: string): Promise<ProjectApiKey | undefined>;
  createProjectApiKey(projectId: string, apiKey: string): Promise<ProjectApiKey>;
  
  // Imports
  createImport(importData: InsertImport): Promise<Import>;
  getImportByUploadId(uploadId: string): Promise<Import | undefined>;
  getImportsByProjectId(projectId: string): Promise<Import[]>;
  updateImportFieldMapping(uploadId: string, fieldMapping: string): Promise<Import | undefined>;

  // Import Jobs
  createImportJob(jobData: any): Promise<any>;
  getImportJobStatus(projectId: string, jobId?: string): Promise<any>;
  updateImportJob(jobId: string, updates: any): Promise<any>;
  cancelImportJob(jobId: string): Promise<void>;
  getImportJobLogs(jobId: string): Promise<string[] | null>;
  
  // Pages management
  saveProcessedPages(projectId: string, pagesData: any[]): Promise<void>;
  getProjectPages(projectId: string): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // Projects
  async getProjects(userId: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  async getProjectById(projectId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    return project || undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  async deleteProject(id: string, userId: string): Promise<void> {
    await db
      .delete(projects)
      .where(eq(projects.id, id));
  }

  // User Progress
  async getUserProgress(userId: string): Promise<UserProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId));
    return progress || undefined;
  }

  async updateUserProgress(userId: string, progress: Partial<InsertProgress>): Promise<UserProgress> {
    // First try to update existing progress
    const [existing] = await db
      .update(userProgress)
      .set({ ...progress, updatedAt: new Date() })
      .where(eq(userProgress.userId, userId))
      .returning();

    if (existing) {
      return existing;
    }

    // If no existing progress, create new one
    const [newProgress] = await db
      .insert(userProgress)
      .values({ userId, ...progress } as InsertProgress)
      .returning();
    return newProgress;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async dismissNotification(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ dismissed: "true" })
      .where(eq(notifications.id, id));
  }

  // API Keys
  async getProjectApiKey(projectId: string): Promise<ProjectApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(projectApiKeys)
      .where(eq(projectApiKeys.projectId, projectId));
    return apiKey || undefined;
  }

  async createProjectApiKey(projectId: string, apiKey: string): Promise<ProjectApiKey> {
    const [newApiKey] = await db
      .insert(projectApiKeys)
      .values({ projectId, apiKey })
      .returning();
    return newApiKey;
  }

  // Imports
  async createImport(importData: InsertImport): Promise<Import> {
    const [newImport] = await db
      .insert(imports)
      .values(importData)
      .returning();
    return newImport;
  }

  async getImportByUploadId(uploadId: string): Promise<Import | undefined> {
    const [importRecord] = await db
      .select()
      .from(imports)
      .where(eq(imports.id, uploadId));
    return importRecord || undefined;
  }

  async updateImportFieldMapping(uploadId: string, fieldMapping: string): Promise<Import | undefined> {
    const [updatedImport] = await db
      .update(imports)
      .set({ fieldMapping, status: "mapped" })
      .where(eq(imports.id, uploadId))
      .returning();
    return updatedImport || undefined;
  }

  async getImportsByProjectId(projectId: string): Promise<Import[]> {
    const result = await db.select().from(imports)
      .where(eq(imports.projectId, projectId))
      .orderBy(desc(imports.createdAt));
    return result;
  }

  // Import Jobs - in-memory implementation with persistence
  async createImportJob(jobData: any): Promise<any> {
    const job = {
      id: crypto.randomUUID(),
      jobId: jobData.jobId,
      projectId: jobData.projectId,
      importId: jobData.importId,
      status: jobData.status || "pending",
      phase: jobData.phase || "loading",
      percent: jobData.percent || 0,
      pagesTotal: jobData.pagesTotal || 0,
      pagesDone: jobData.pagesDone || 0,
      blocksDone: jobData.blocksDone || 0,
      orphanCount: jobData.orphanCount || 0,
      avgWordCount: jobData.avgWordCount || 0,
      deepPages: jobData.deepPages || 0,
      avgClickDepth: jobData.avgClickDepth || 0.0,
      logs: [`Создан импорт джоб ${jobData.jobId}`],
      startedAt: new Date(),
      finishedAt: null
    };
    
    // Save to database first for foreign key constraint
    try {
      await db.insert(importJobs).values({
        id: job.id,
        jobId: job.jobId,
        projectId: job.projectId,
        importId: job.importId,
        status: job.status,
        phase: job.phase,
        percent: job.percent,
        pagesTotal: job.pagesTotal,
        pagesDone: job.pagesDone,
        blocksDone: job.blocksDone,
        orphanCount: job.orphanCount,
        avgWordCount: job.avgWordCount,
        deepPages: job.deepPages,
        avgClickDepth: job.avgClickDepth,
        logs: job.logs,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt
      });
      console.log(`✓ Saved import job ${jobData.jobId} to database`);
    } catch (error) {
      console.error(`❌ Failed to save import job to database:`, error);
    }
    
    // Ensure global storage is initialized
    if (!global.importJobs) {
      global.importJobs = new Map();
      console.log('Initialized new global.importJobs Map');
    }
    
    // Store the job immediately
    global.importJobs.set(jobData.jobId, job);
    
    // Verify storage
    const stored = global.importJobs.get(jobData.jobId);
    console.log(`✓ Created and verified import job ${jobData.jobId} - stored: ${!!stored}`);
    console.log(`✓ Total jobs in memory: ${global.importJobs.size}`);
    
    return job;
  }

  async getImportJobStatus(projectId: string, jobId?: string): Promise<any> {
    try {
      // First try to get from database
      if (jobId && jobId !== 'undefined') {
        console.log(`🔍 Searching for job ${jobId} in database...`);
        const [dbJob] = await db.select().from(importJobs).where(eq(importJobs.jobId, jobId));
        console.log(`Database query result:`, dbJob ? 'Found' : 'Not found');
        if (dbJob) {
          console.log(`✅ Found job ${jobId} in database:`, {
            status: dbJob.status,
            phase: dbJob.phase,
            percent: dbJob.percent,
            pagesTotal: dbJob.pagesTotal,
            pagesDone: dbJob.pagesDone,
            blocksDone: dbJob.blocksDone
          });
          return {
            jobId: dbJob.jobId,
            projectId: dbJob.projectId,
            importId: dbJob.importId,
            status: dbJob.status,
            phase: dbJob.phase,
            percent: dbJob.percent,
            pagesTotal: dbJob.pagesTotal,
            pagesDone: dbJob.pagesDone,
            blocksDone: dbJob.blocksDone,
            orphanCount: dbJob.orphanCount,
            avgWordCount: dbJob.avgWordCount,
            deepPages: dbJob.deepPages,
            avgClickDepth: dbJob.avgClickDepth,
            logs: dbJob.logs || [],
            errorMessage: dbJob.errorMessage,
            startedAt: dbJob.startedAt,
            finishedAt: dbJob.finishedAt
          };
        } else {
          console.log(`❌ Job ${jobId} not found in database`);
        }
      } else {
        // Get latest job for project from database
        const dbJobs = await db.select().from(importJobs)
          .where(eq(importJobs.projectId, projectId))
          .orderBy(desc(importJobs.startedAt))
          .limit(1);
        
        if (dbJobs.length > 0) {
          const dbJob = dbJobs[0];
          console.log(`Found latest job for project ${projectId} in database: ${dbJob.jobId}`);
          return {
            jobId: dbJob.jobId,
            projectId: dbJob.projectId,
            importId: dbJob.importId,
            status: dbJob.status,
            phase: dbJob.phase,
            percent: dbJob.percent,
            pagesTotal: dbJob.pagesTotal,
            pagesDone: dbJob.pagesDone,
            blocksDone: dbJob.blocksDone,
            orphanCount: dbJob.orphanCount,
            avgWordCount: dbJob.avgWordCount,
            deepPages: dbJob.deepPages,
            avgClickDepth: dbJob.avgClickDepth,
            logs: dbJob.logs || [],
            errorMessage: dbJob.errorMessage,
            startedAt: dbJob.startedAt,
            finishedAt: dbJob.finishedAt
          };
        }
      }
      
      // Fallback to memory if not found in database
      if (!global.importJobs) return null;
      
      if (jobId && jobId !== 'undefined') {
        return global.importJobs.get(jobId) || null;
      }
      
      // Get latest job for project from memory
      const jobs = Array.from(global.importJobs.values())
        .filter(job => job.projectId === projectId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      
      return jobs[0] || null;
    } catch (error) {
      console.error('Error getting import job status:', error);
      return null;
    }
  }

  async updateImportJob(jobId: string, updates: any): Promise<any> {
    try {
      // Initialize global.importJobs if not exists
      if (!global.importJobs) {
        global.importJobs = new Map();
        console.log(`updateImportJob: Initialized global.importJobs for ${jobId}`);
      }
      
      let job = global.importJobs.get(jobId);
      if (!job) {
        // Create basic job structure if missing
        job = {
          jobId,
          status: 'running',
          phase: 'loading',
          percent: 0,
          pagesTotal: 0,
          pagesDone: 0,
          blocksDone: 0,
          orphanCount: 0,
          avgWordCount: 0,
          logs: [],
          startedAt: new Date()
        };
        global.importJobs.set(jobId, job);
        console.log(`updateImportJob: Created missing job ${jobId}`);
      }
      
      // Apply updates
      Object.assign(job, updates);
      
      // Handle logs properly
      if (updates.logs && Array.isArray(updates.logs)) {
        job.logs = [...(job.logs || []), ...updates.logs];
        if (job.logs.length > 1000) {
          job.logs = job.logs.slice(-1000);
        }
      }
      
      // Update database
      try {
        console.log(`🔄 Updating database for job ${jobId} with:`, {
          status: job.status,
          phase: job.phase,
          percent: job.percent,
          pagesTotal: job.pagesTotal,
          pagesDone: job.pagesDone,
          blocksDone: job.blocksDone
        });
        
        const result = await db.update(importJobs)
          .set({
            status: job.status,
            phase: job.phase,
            percent: job.percent,
            pagesTotal: job.pagesTotal,
            pagesDone: job.pagesDone,
            blocksDone: job.blocksDone,
            orphanCount: job.orphanCount,
            avgWordCount: job.avgWordCount,
            deepPages: job.deepPages,
            avgClickDepth: job.avgClickDepth,
            logs: job.logs,
            errorMessage: job.errorMessage,
            finishedAt: job.finishedAt
          })
          .where(eq(importJobs.jobId, jobId))
          .returning();
          
        console.log(`✅ Database update result for ${jobId}:`, result.length > 0 ? 'Success' : 'No rows updated');
      } catch (dbError) {
        console.error(`❌ Failed to update job ${jobId} in database:`, dbError);
      }
      
      console.log(`updateImportJob: updated ${jobId} - phase: ${job.phase}, percent: ${job.percent}`);
      return job;
    } catch (error) {
      console.error(`Error updating import job ${jobId}:`, error);
      return null;
    }
  }

  async cancelImportJob(jobId: string): Promise<void> {
    await this.updateImportJob(jobId, {
      status: "canceled",
      finishedAt: new Date(),
      logs: ["Import canceled by user"]
    });
  }

  async getImportJobLogs(jobId: string): Promise<string[] | null> {
    if (!global.importJobs) return null;
    
    const job = global.importJobs.get(jobId);
    return job ? job.logs || [] : null;
  }

  // Pages management for debug functionality
  async saveProcessedPages(projectId: string, pagesData: any[], jobId?: string): Promise<void> {
    // Use provided jobId or generate new one
    const batchId = jobId || crypto.randomUUID();
    const importBatchId = crypto.randomUUID(); // Always generate a new UUID for importBatchId
    
    // Save new pages data with a consistent jobId
    if (pagesData.length > 0) {
      const pagesToInsert = pagesData.map((page, index) => ({
        jobId: batchId, // Use same ID for all pages in this batch
        url: page.url || `#page-${index + 1}`,
        rawHtml: page.content || '',
        meta: sql`${JSON.stringify({
          title: page.title || `Страница ${index + 1}`,
          wordCount: page.wordCount || 0,
          urlDepth: page.urlDepth || 0,
          internalLinkCount: page.internalLinkCount || 0,
          isOrphan: page.isOrphan || false,
          contentPreview: page.contentPreview || ''
        })}`,
        importBatchId: importBatchId
      }));
      
      // Delete existing pages for this project first
      await db.execute(sql`DELETE FROM pages_raw WHERE import_batch_id IN (
        SELECT DISTINCT import_batch_id FROM pages_raw pr 
        INNER JOIN import_jobs ij ON pr.job_id = ij.job_id
        WHERE ij.project_id::text = ${projectId}
      )`);
      
      await db.insert(pagesRaw).values(pagesToInsert);
    }
  }

  async getProjectPages(projectId: string): Promise<any[]> {
    const pages = await db.execute(sql`
      SELECT pr.* FROM pages_raw pr 
      INNER JOIN import_jobs ij ON pr.job_id = ij.job_id
      WHERE ij.project_id::text = ${projectId}
      ORDER BY pr.created_at DESC
    `);
    
    return (pages.rows || []).map((page: any) => {
      const meta = typeof page.meta === 'string' ? JSON.parse(page.meta) : page.meta;
      return {
        url: page.url,
        title: meta?.title || 'Без названия',
        content: page.raw_html,
        wordCount: meta?.wordCount || 0,
        urlDepth: meta?.urlDepth || 0,
        internalLinkCount: meta?.internalLinkCount || 0,
        isOrphan: meta?.isOrphan || false,
        contentPreview: meta?.contentPreview || (page.raw_html || '').substring(0, 150)
      };
    });
  }
}

export const storage = new DatabaseStorage();
