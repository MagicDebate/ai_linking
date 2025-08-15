import { useMutation } from '@tanstack/react-query';

interface StartGenerationParams {
  projectId: string;
  seoProfile: any; // SEOProfile from SEOSettings
}

export function useGeneration() {
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
  });

  return {
    startGeneration: startGenerationMutation.mutate,
    startGenerationAsync: startGenerationMutation.mutateAsync,
    isStartingGeneration: startGenerationMutation.isPending,
  };
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
