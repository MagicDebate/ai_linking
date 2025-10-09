import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { db } from './db';
import { importJobs, generationRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Redis connection - optional for development
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: () => null // Don't retry failed connections
});

// Suppress Redis connection errors (queue functionality is optional)
redis.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    // Silently ignore - Redis is not available
  } else {
    console.warn('⚠️ Redis error:', err.message);
  }
});

// Queue names
export const QUEUE_NAMES = {
  IMPORT: 'import-processing',
  EMBEDDING: 'embedding-generation',
  LINK_GENERATION: 'link-generation',
  SIMILARITY_SEARCH: 'similarity-search'
} as const;

// Import processing queue
export const importQueue = new Queue(QUEUE_NAMES.IMPORT, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Embedding generation queue
export const embeddingQueue = new Queue(QUEUE_NAMES.EMBEDDING, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

// Link generation queue
export const linkGenerationQueue = new Queue(QUEUE_NAMES.LINK_GENERATION, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

// Similarity search queue
export const similaritySearchQueue = new Queue(QUEUE_NAMES.SIMILARITY_SEARCH, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// Job types
export interface ImportJobData {
  jobId: string;
  projectId: string;
  uploadId: string;
}

export interface EmbeddingJobData {
  jobId: string;
  projectId: string;
  blockIds: string[];
  batchSize?: number;
}

export interface LinkGenerationJobData {
  runId: string;
  projectId: string;
  scenarios: any;
  rules: any;
  scope: any;
}

export interface SimilaritySearchJobData {
  sourceBlockId: string;
  projectId: string;
  topK: number;
  threshold: number;
}

// Workers disabled - Redis not available in this environment
// TODO: Enable workers when Redis is configured
console.log('⚠️ Queue workers disabled - Redis not configured');

export const importWorker: any = null;
export const embeddingWorker: any = null;
export const linkGenerationWorker: any = null;
export const similaritySearchWorker: any = null;

export { redis };
