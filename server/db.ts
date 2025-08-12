import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Отключаем WebSocket для локальной PostgreSQL
if (process.env.DATABASE_URL?.includes('localhost')) {
  // Для локальной PostgreSQL отключаем WebSocket
  console.log('🔧 Using local PostgreSQL, disabling WebSocket connection');
} else {
  // Для Neon Database используем WebSocket
  console.log('🔧 Using Neon Database, enabling WebSocket connection');
  neonConfig.webSocketConstructor = ws;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });