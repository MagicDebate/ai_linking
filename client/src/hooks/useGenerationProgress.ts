import { useQuery } from '@tanstack/react-query';

interface GenerationProgress {
  runId: string;
  status: 'running' | 'draft' | 'published' | 'failed' | 'canceled';
  phase: string;
  percent: number;
  generated: number;
  rejected: number;
  taskProgress: {
    orphanFix: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
    headConsolidation: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
    clusterCrossLink: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
    commercialRouting: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
    depthLift: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
    freshnessPush: { percent: number; scanned: number; candidates: number; accepted: number; rejected: number };
  };
  counters: {
    scanned: number;
    candidates: number;
    accepted: number;
    rejected: number;
  };
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

export function useGenerationProgress(runId: string | null) {
  return useQuery({
    queryKey: ['generation-progress', runId],
    queryFn: async (): Promise<GenerationProgress> => {
      if (!runId) throw new Error('No run ID provided');
      
      const response = await fetch(`/api/generate/progress/${runId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get generation progress');
      }
      return response.json();
    },
    enabled: !!runId,
    refetchInterval: (data) => {
      // Stop polling when generation is complete
      if (data?.status === 'draft' || data?.status === 'published' || data?.status === 'failed' || data?.status === 'canceled') {
        return false;
      }
      return 2000; // Poll every 2 seconds while running
    },
    staleTime: 0,
    cacheTime: 0,
  });
}
