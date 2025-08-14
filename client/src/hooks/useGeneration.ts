import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

interface StartGenerationParams {
  projectId: string;
  seoProfile: any; // SEOProfile from SEOSettings
}

// Изолированная функция для логирования без внешних зависимостей
const logGenerationEvent = (type: 'start' | 'error', data: any) => {
  if (type === 'start') {
    console.log('✅ Generation started:', data);
  } else {
    console.error('❌ Generation start error:', data);
  }
};

export function useGeneration() {
  const queryClient = useQueryClient();

  // Start generation mutation
  const startGenerationMutation = useMutation({
    mutationFn: async ({ projectId, seoProfile }: StartGenerationParams) => {
      const response = await fetch('/api/generate/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, seoProfile }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start generation');
      }

      return response.json();
    },
    onSuccess: (data) => {
      logGenerationEvent('start', data);
    },
    onError: (error: Error) => {
      logGenerationEvent('error', error);
    },
  });

  return {
    startGeneration: startGenerationMutation.mutate,
    startGenerationAsync: startGenerationMutation.mutateAsync,
    isStartingGeneration: startGenerationMutation.isPending,
  };
}

// Отдельный хук для прогресса генерации
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

// Отдельный хук для результатов черновика
export function useDraftResults(runId: string | null, filters?: { type?: string; status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['draft-results', runId, filters],
    queryFn: async () => {
      if (!runId) throw new Error('No run ID provided');
      
      const params = new URLSearchParams();
      if (filters?.type) params.append('type', filters.type);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());
      
      const response = await fetch(`/api/generate/draft/${runId}?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get draft results');
      }
      return response.json();
    },
    enabled: !!runId,
  });
}
