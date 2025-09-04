import { useQuery } from '@tanstack/react-query';

interface ImportStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  totalRows?: number;
  processedRows?: number;
  errorMessage?: string;
  completedAt?: string;
}

export function useImportStatus(jobId: string | null, enabled: boolean = true) {
  console.log('🔍 [useImportStatus] Hook called with jobId:', jobId, 'enabled:', enabled);
  
  return useQuery({
    queryKey: ['import-status', jobId],
    queryFn: async (): Promise<ImportStatus> => {
      console.log('🔍 [useImportStatus] QueryFn called with jobId:', jobId);
      
      if (!jobId) {
        console.log('❌ [useImportStatus] No jobId provided');
        throw new Error('No job ID provided');
      }
      
      console.log('🔍 [useImportStatus] Fetching from:', `/api/import/status/${jobId}`);
      const response = await fetch(`/api/import/status/${jobId}`);
      
      console.log('🔍 [useImportStatus] Response status:', response.status);
      
      if (!response.ok) {
        const error = await response.json();
        console.log('❌ [useImportStatus] Response error:', error);
        throw new Error(error.error || 'Failed to get import status');
      }
      
      const data = await response.json();
      console.log('✅ [useImportStatus] Response data:', data);
      return data;
    },
    enabled: !!jobId && enabled,
    refetchInterval: (data) => {
      // Stop polling when import is complete or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        console.log('🛑 [useImportStatus] Stopping polling - import is', data?.status);
        return false;
      }
      // Only poll if status is pending or running
      if (data?.status === 'pending' || data?.status === 'running') {
        return 2000; // Poll every 2 seconds while running
      }
      return false; // Don't poll for unknown statuses
    },
    refetchIntervalInBackground: false, // Don't poll in background
    staleTime: 0,
    cacheTime: 0,
  });
}



