import { 
  users, 
  projects, 
  userProgress, 
  notifications,
  projectApiKeys,
  imports,
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
import { eq, desc } from "drizzle-orm";

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
  updateImportFieldMapping(uploadId: string, fieldMapping: string): Promise<Import | undefined>;

  // Import Jobs
  createImportJob(jobData: any): Promise<any>;
  getImportJobStatus(projectId: string, jobId?: string): Promise<any>;
  updateImportJob(jobId: string, updates: any): Promise<void>;
  cancelImportJob(jobId: string): Promise<void>;
  getImportJobLogs(jobId: string): Promise<string[] | null>;
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

  // Import Jobs - in-memory implementation with persistence
  async createImportJob(jobData: any): Promise<any> {
    const job = {
      id: Math.random().toString(36),
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
    if (!global.importJobs) return null;
    
    if (jobId && jobId !== 'undefined') {
      return global.importJobs.get(jobId) || null;
    }
    
    // Get latest job for project
    const jobs = Array.from(global.importJobs.values())
      .filter(job => job.projectId === projectId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    
    return jobs[0] || null;
  }

  async updateImportJob(jobId: string, updates: any): Promise<any> {
    if (!global.importJobs) {
      console.log(`updateImportJob: global.importJobs not initialized for ${jobId}`);
      return null;
    }
    
    const job = global.importJobs.get(jobId);
    if (!job) {
      console.log(`updateImportJob: job ${jobId} not found. Available:`, Array.from(global.importJobs.keys()));
      return null;
    }
    
    Object.assign(job, updates);
    
    // Append new logs
    if (updates.logs && Array.isArray(updates.logs)) {
      job.logs = [...(job.logs || []), ...updates.logs];
      // Keep only last 1000 log entries
      if (job.logs.length > 1000) {
        job.logs = job.logs.slice(-1000);
      }
    }
    
    console.log(`updateImportJob: updated ${jobId} - phase: ${job.phase}, percent: ${job.percent}`);
    return job;
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
}

export const storage = new DatabaseStorage();
