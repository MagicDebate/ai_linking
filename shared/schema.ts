import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, uuid, integer, jsonb, real, boolean, vector } from "drizzle-orm/pg-core";
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

// Import jobs for Step 4 processing
export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").unique().notNull().defaultRandom(),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  importId: varchar("import_id").references(() => imports.id).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, running, completed, failed, canceled
  phase: varchar("phase", { length: 50 }).notNull().default("loading"), // loading, cleaning, chunking, extracting, embedding, graphing, finalizing
  percent: integer("percent").notNull().default(0),
  pagesTotal: integer("pages_total").notNull().default(0),
  pagesDone: integer("pages_done").notNull().default(0),
  blocksDone: integer("blocks_done").notNull().default(0),
  orphanCount: integer("orphan_count").notNull().default(0),
  avgWordCount: integer("avg_word_count").notNull().default(0),
  deepPages: integer("deep_pages").notNull().default(0),
  avgClickDepth: real("avg_click_depth").notNull().default(0),
  importDuration: integer("import_duration"), // seconds
  logs: text("logs").array().notNull().default(sql`ARRAY[]::text[]`),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

// Raw pages data
export const pagesRaw = pgTable("pages_raw", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => importJobs.jobId).notNull(),
  url: text("url").notNull(),
  rawHtml: text("raw_html").notNull(),
  meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  importBatchId: uuid("import_batch_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cleaned pages data
export const pagesClean = pgTable("pages_clean", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageRawId: uuid("page_raw_id").references(() => pagesRaw.id).notNull(),
  cleanHtml: text("clean_html").notNull(),
  wordCount: integer("word_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Content blocks
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").references(() => pagesClean.id).notNull(),
  blockType: varchar("block_type", { length: 20 }).notNull(), // p, h1, h2, h3, h4, h5, h6, list, paragraph_group
  text: text("text").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Embeddings
export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id").references(() => blocks.id).notNull(),
  vector: real("vector").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Link edges between pages
export const edges = pgTable("edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => importJobs.jobId).notNull(),
  fromPageId: uuid("from_page_id").references(() => pagesClean.id).notNull(),
  toPageId: uuid("to_page_id").references(() => pagesClean.id).notNull(),
  fromUrl: text("from_url").notNull(),
  toUrl: text("to_url").notNull(),
  anchorText: text("anchor_text"),
  isInternal: boolean("is_internal").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Graph metadata for each page
export const graphMeta = pgTable("graph_meta", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").references(() => pagesClean.id).notNull().unique(),
  jobId: uuid("job_id").references(() => importJobs.jobId).notNull(),
  url: text("url").notNull(),
  clickDepth: integer("click_depth").notNull().default(1),
  inDegree: integer("in_degree").notNull().default(0),
  outDegree: integer("out_degree").notNull().default(0),
  isOrphan: boolean("is_orphan").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ========== LINK GENERATION SYSTEM ==========

export const runStatusEnum = pgEnum("run_status", ["running", "draft", "published", "failed", "canceled"]);

// Generation Runs table
export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").unique().notNull().defaultRandom(),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  importId: varchar("import_id").references(() => imports.id).notNull(),
  status: runStatusEnum("status").notNull().default("running"),
  phase: varchar("phase", { length: 50 }).notNull().default("starting"), // starting, analyzing, generating, checking_404, finalizing
  percent: integer("percent").notNull().default(0),
  generated: integer("generated").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  
  // Generation parameters stored as JSON
  scenarios: jsonb("scenarios").notNull().default(sql`'{}'::jsonb`),
  rules: jsonb("rules").notNull().default(sql`'{}'::jsonb`),
  scope: jsonb("scope").notNull().default(sql`'{}'::jsonb`),
  
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  errorMessage: text("error_message"),
});

// Page embeddings for similarity calculations
export const pageEmbeddings = pgTable("page_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").references(() => pagesClean.id).notNull(),
  jobId: uuid("job_id").references(() => importJobs.jobId).notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  contentVector: text("content_vector").notNull(), // JSON string of keywords/embeddings
  publishedAt: timestamp("published_at"),
  wordCount: integer("word_count").notNull().default(0),
  isDeep: boolean("is_deep").notNull().default(false),
  isMoney: boolean("is_money").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Link candidates generated by algorithm
export const linkCandidates = pgTable("link_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => generationRuns.runId).notNull(),
  sourcePageId: uuid("source_page_id").references(() => pagesClean.id).notNull(),
  targetPageId: uuid("target_page_id").references(() => pagesClean.id).notNull(),
  sourceUrl: text("source_url").notNull(),
  targetUrl: text("target_url").notNull(),
  anchorText: text("anchor_text").notNull(),
  
  // Link metadata
  scenario: varchar("scenario", { length: 30 }).notNull(), // orphan, head, depth, fresh, cross, money
  similarity: real("similarity"), // cosine similarity for cannibalization
  position: integer("position").notNull(), // position in source text
  isDraft: boolean("is_draft").notNull().default(true),
  isRejected: boolean("is_rejected").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  
  // HTML attributes
  cssClass: text("css_class"),
  relAttribute: text("rel_attribute"),
  targetAttribute: text("target_attribute"),
  modifiedSentence: text("modified_sentence"), // Для хранения переписанного предложения
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// URLs that returned 404 during generation
export const brokenUrls = pgTable("broken_urls", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => generationRuns.runId).notNull(),
  url: text("url").notNull(),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

// Project import configurations for saving and reusing settings
export const projectImportConfigs = pgTable("project_import_configs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: text("project_id").references(() => projects.id).notNull(),
  fileName: text("file_name").notNull(),
  fieldMapping: jsonb("field_mapping").notNull(), // FieldMapping object
  selectedScenarios: jsonb("selected_scenarios").notNull(), // string[]
  scopeSettings: jsonb("scope_settings").notNull(), // scope configuration
  linkingRules: jsonb("linking_rules").notNull(), // LinkingRules object
  isLastUsed: boolean("is_last_used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const insertGenerationRunSchema = createInsertSchema(generationRuns).omit({
  id: true,
  runId: true,
  startedAt: true,
  finishedAt: true,
});

export const insertLinkCandidateSchema = createInsertSchema(linkCandidates).omit({
  id: true,
  createdAt: true,
});

export const insertPageEmbeddingSchema = createInsertSchema(pageEmbeddings).omit({
  id: true,
  createdAt: true,
});

export const insertProjectImportConfigSchema = createInsertSchema(projectImportConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Generation run types 
export type GenerationRun = typeof generationRuns.$inferSelect;
export type LinkCandidate = typeof linkCandidates.$inferSelect;
export type PageEmbedding = typeof pageEmbeddings.$inferSelect;
export type PageClean = typeof pagesClean.$inferSelect;
export type ProjectImportConfig = typeof projectImportConfigs.$inferSelect;
export type InsertProjectImportConfig = z.infer<typeof insertProjectImportConfigSchema>;
export type GraphMeta = typeof graphMeta.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;

export type InsertGenerationRun = z.infer<typeof insertGenerationRunSchema>;
export type InsertLinkCandidate = z.infer<typeof insertLinkCandidateSchema>;
export type InsertPageEmbedding = z.infer<typeof insertPageEmbeddingSchema>;

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
    (mapping) => {
      // Согласно ТЗ обязательны только URL, Текст, контент
      const required = ['url', 'title', 'content'];
      return required.every(field => mapping[field] && mapping[field].trim() !== '' && mapping[field] !== '__none__');
    },
    {
      message: "URL, Title и Content поля обязательны для сопоставления",
      path: ["fieldMapping"]
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
