import { 
  users, 
  projects, 
  userProgress, 
  notifications,
  type User, 
  type InsertUser,
  type Project,
  type InsertProject,
  type UserProgress,
  type InsertProgress,
  type Notification,
  type InsertNotification
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  // Projects
  getProjects(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: string, userId: string): Promise<void>;
  
  // User Progress
  getUserProgress(userId: string): Promise<UserProgress | undefined>;
  updateUserProgress(userId: string, progress: Partial<InsertProgress>): Promise<UserProgress>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  dismissNotification(id: string, userId: string): Promise<void>;
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
}

export const storage = new DatabaseStorage();
