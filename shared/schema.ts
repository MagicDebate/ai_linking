import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const providerEnum = pgEnum("provider", ["LOCAL", "GOOGLE"]);
export const projectStatusEnum = pgEnum("project_status", ["QUEUED", "READY"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  provider: providerEnum("provider").notNull().default("LOCAL"),
  googleId: text("google_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  status: projectStatusEnum("status").notNull().default("QUEUED"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createProject: text("create_project").notNull().default("false"),
  uploadTexts: text("upload_texts").notNull().default("false"),
  setPriorities: text("set_priorities").notNull().default("false"),
  generateDraft: text("generate_draft").notNull().default("false"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  link: text("link"),
  type: text("type").notNull().default("info"),
  dismissed: text("dismissed").notNull().default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectApiKeys = pgTable("project_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const imports = pgTable("imports", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  status: text("status").notNull().default("PENDING"), // PENDING, MAPPED, PROCESSED
  fieldMapping: text("field_mapping"), // JSON string
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const registerUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertApiKeySchema = createInsertSchema(projectApiKeys).omit({
  id: true,
  createdAt: true,
});

export const insertImportSchema = createInsertSchema(imports).omit({
  createdAt: true,
});

export const fieldMappingSchema = z.object({
  uploadId: z.string(),
  fieldMapping: z.record(z.string(), z.string()).refine(
    (mapping) => mapping.url && mapping.url.trim() !== '',
    {
      message: "URL field mapping is required",
      path: ["url"]
    }
  ),
  projectId: z.string().optional(),
});

export const linkingRulesSchema = z.object({
  projectId: z.string(),
  limits: z.object({
    maxLinks: z.number().min(1).max(10),
    minDistance: z.number().min(50).max(500),
    exactPercent: z.number().min(0).max(50),
  }),
  scenarios: z.object({
    headConsolidation: z.boolean(),
    clusterCrossLink: z.boolean(),
    commercialRouting: z.boolean(),
    orphanFix: z.boolean(),
    depthLift: z.boolean(),
  }),
  depthThreshold: z.number().min(4).max(8),
  oldLinksPolicy: z.enum(['enrich', 'regenerate', 'audit']),
  dedupeLinks: z.boolean(),
  brokenLinksPolicy: z.enum(['delete', 'replace', 'ignore']),
  stopAnchors: z.array(z.string()),
  moneyPages: z.array(z.string()),
  freshnessPush: z.boolean(),
  freshnessThreshold: z.number().min(1).max(365),
  freshnessLinks: z.number().min(0).max(3),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type RegisterUser = z.infer<typeof registerUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertProgress = z.infer<typeof insertProgressSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type ProjectApiKey = typeof projectApiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type Import = typeof imports.$inferSelect;
export type InsertImport = z.infer<typeof insertImportSchema>;
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
