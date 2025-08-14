import { useQuery } from '@tanstack/react-query';

export interface ImportStatus {
  status: 'running' | 'completed' | 'failed' | 'canceled';
  phase: string;
  percent: number;
  currentItem?: string;
  error?: string;
  stats?: {
    totalPages: number;
    totalBlocks: number;
    totalWords: number;
  };
  errors?: string[];
  pagesTotal?: number;
  pagesDone?: number;
  blocksDone?: number;
  orphanCount?: number;
  avgWordCount?: number;
  deepPages?: number;
  avgClickDepth?: number;
  logs?: string[];
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
}

export function useImportStatus(jobId: string | null, currentStep: number) {
  return useQuery<ImportStatus>({
    queryKey: ['/api/import/status', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      
      console.log(`🔍 Fetching import status for jobId: ${jobId}`);
      const response = await fetch(`/api/import/status/${jobId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to get import status');
      }
      
      const data = await response.json();
      console.log(`📊 Import status response:`, data);
      return data;
    },
    enabled: !!jobId && currentStep === 2,
    refetchInterval: 1000, // Обновляем каждую секунду на шаге 2
    staleTime: 0, // Данные всегда считаются устаревшими
    cacheTime: 0, // Отключаем кэширование
    retry: 3,
    retryDelay: 1000
  });
}
