console.log('🔄 [EMBEDDINGS-SCHEMA] Loading embeddings-schema.ts...');

import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, varchar, vector } from "drizzle-orm/pg-core";

console.log('✅ [EMBEDDINGS-SCHEMA] Drizzle imports successful');

// Embeddings with pgvector support
console.log('🔧 [EMBEDDINGS-SCHEMA] Creating embeddings table...');
export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id").notNull(), // Убираем ссылку на blocks.id
  vector: vector("vector", { dimensions: 384 }).notNull(), // pgvector для быстрого поиска
  textHash: text("text_hash").notNull(), // SHA-256 хэш нормализованного текста для кэширования
  projectId: varchar("project_id").notNull(), // Убираем ссылку на projects.id
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Кэш эмбеддингов для оптимизации
export const embeddingCache = pgTable("embedding_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: varchar("project_id").notNull(), // Убираем ссылку на projects.id
  textHash: text("text_hash").notNull(),
  vector: vector("vector", { dimensions: 384 }).notNull(),
  language: varchar("language", { length: 10 }).notNull().default('ru'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsed: timestamp("last_used").defaultNow().notNull(),
});

console.log('✅ [EMBEDDINGS-SCHEMA] All tables created successfully');
console.log('🔍 [EMBEDDINGS-SCHEMA] Available exports:', { embeddings: !!embeddings, embeddingCache: !!embeddingCache });
console.log('✅ [EMBEDDINGS-SCHEMA] embeddings-schema.ts loaded completely');
