import { useQuery } from '@tanstack/react-query';

interface GenerationLogsResponse {
  success: boolean;
  runId: string;
  status: string;
  createdAt: string;
  logs: string[];
  totalLines: number;
}

export function useGenerationLogs(runId: string | null, enabled: boolean = true) {
  return useQuery<GenerationLogsResponse>({
    queryKey: ['generationLogs', runId],
    queryFn: async () => {
      if (!runId) throw new Error('No runId provided');
      
      const response = await fetch(`/api/generate/logs/${runId}?lines=200`);
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled && !!runId,
    refetchInterval: 2000, // Обновляем каждые 2 секунды
    refetchIntervalInBackground: true,
  });
}
