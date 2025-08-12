import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { db } from './db';
import { importJobs, generationRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
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

// Worker for import processing
export const importWorker = new Worker(
  QUEUE_NAMES.IMPORT,
  async (job: Job<ImportJobData>) => {
    const { jobId, projectId, uploadId } = job.data;
    
    console.log(`🚀 Processing import job ${jobId} for project ${projectId}`);
    
    // Update job status to running
    await db.update(importJobs)
      .set({ 
        status: 'running',
        phase: 'loading',
        percent: 0,
        startedAt: new Date()
      })
      .where(eq(importJobs.jobId, jobId));
    
    try {
      // Import processing logic will be implemented here
      // For now, just simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update job status to completed
      await db.update(importJobs)
        .set({ 
          status: 'completed',
          phase: 'completed',
          percent: 100,
          finishedAt: new Date()
        })
        .where(eq(importJobs.jobId, jobId));
        
      console.log(`✅ Import job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`❌ Import job ${jobId} failed:`, error);
      
      // Update job status to failed
      await db.update(importJobs)
        .set({ 
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          finishedAt: new Date()
        })
        .where(eq(importJobs.jobId, jobId));
        
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Process 2 import jobs simultaneously
  }
);

// Worker for embedding generation
export const embeddingWorker = new Worker(
  QUEUE_NAMES.EMBEDDING,
  async (job: Job<EmbeddingJobData>) => {
    const { jobId, projectId, blockIds, batchSize = 32 } = job.data;
    
    console.log(`🔢 Processing embedding job ${jobId} for ${blockIds.length} blocks`);
    
    try {
      // Embedding generation logic will be implemented here
      // For now, just simulate processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Embedding job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`❌ Embedding job ${jobId} failed:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Process 1 embedding job at a time (resource intensive)
  }
);

// Worker for link generation
export const linkGenerationWorker = new Worker(
  QUEUE_NAMES.LINK_GENERATION,
  async (job: Job<LinkGenerationJobData>) => {
    const { runId, projectId, scenarios, rules, scope } = job.data;
    
    console.log(`🔗 Processing link generation run ${runId} for project ${projectId}`);
    
    // Update run status to running
    await db.update(generationRuns)
      .set({ 
        status: 'running',
        phase: 'starting',
        percent: 0,
        startedAt: new Date()
      })
      .where(eq(generationRuns.runId, runId));
    
    try {
      // Link generation logic will be implemented here
      // For now, just simulate processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Update run status to completed
      await db.update(generationRuns)
        .set({ 
          status: 'draft',
          phase: 'completed',
          percent: 100,
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));
        
      console.log(`✅ Link generation run ${runId} completed successfully`);
    } catch (error) {
      console.error(`❌ Link generation run ${runId} failed:`, error);
      
      // Update run status to failed
      await db.update(generationRuns)
        .set({ 
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          finishedAt: new Date()
        })
        .where(eq(generationRuns.runId, runId));
        
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Process 1 link generation job at a time
  }
);

// Worker for similarity search
export const similaritySearchWorker = new Worker(
  QUEUE_NAMES.SIMILARITY_SEARCH,
  async (job: Job<SimilaritySearchJobData>) => {
    const { sourceBlockId, projectId, topK, threshold } = job.data;
    
    console.log(`🔍 Processing similarity search for block ${sourceBlockId}`);
    
    try {
      // Similarity search logic will be implemented here
      // For now, just simulate processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log(`✅ Similarity search for block ${sourceBlockId} completed`);
    } catch (error) {
      console.error(`❌ Similarity search for block ${sourceBlockId} failed:`, error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 similarity searches simultaneously
  }
);

// Error handling for workers
importWorker.on('error', (error) => {
  console.error('Import worker error:', error);
});

embeddingWorker.on('error', (error) => {
  console.error('Embedding worker error:', error);
});

linkGenerationWorker.on('error', (error) => {
  console.error('Link generation worker error:', error);
});

similaritySearchWorker.on('error', (error) => {
  console.error('Similarity search worker error:', error);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🛑 Shutting down queue workers...');
  
  try {
    await importWorker.close();
    await embeddingWorker.close();
    await linkGenerationWorker.close();
    await similaritySearchWorker.close();
    
    // Close Redis connection gracefully
    if (redis.status === 'ready') {
      try {
        await redis.quit();
      } catch (error) {
        // Ignore errors when connection is already closed
        console.log('Redis connection already closed');
      }
    }
    
    console.log('✅ Queue workers shut down successfully');
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { redis };




