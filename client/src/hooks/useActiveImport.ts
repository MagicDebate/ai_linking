import { useQuery } from '@tanstack/react-query';

interface ImportJob {
  id: string;
  jobId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  phase: string;
  percent: number;
  createdAt: string;
}

export function useActiveImport(projectId: string | null, enabled: boolean = true) {
  console.log('🔍 [useActiveImport] Hook called with projectId:', projectId, 'enabled:', enabled);
  
  return useQuery({
    queryKey: ['active-import', projectId],
    queryFn: async (): Promise<ImportJob | null> => {
      console.log('🔍 [useActiveImport] QueryFn called with projectId:', projectId);
      
      if (!projectId) {
        console.log('❌ [useActiveImport] No projectId provided');
        return null;
      }
      
      console.log('🔍 [useActiveImport] Fetching active import for project:', projectId);
      
      try {
        // Ищем активные импорты для проекта
        const response = await fetch(`/api/projects/${projectId}/imports/active`);
        
        console.log('🔍 [useActiveImport] Response status:', response.status);
        
        if (response.status === 404) {
          console.log('ℹ️ [useActiveImport] No active import found');
          return null;
        }
        
        if (!response.ok) {
          const error = await response.json();
          console.log('❌ [useActiveImport] Response error:', error);
          throw new Error(error.message || 'Failed to get active import');
        }
        
        const data = await response.json();
        console.log('✅ [useActiveImport] Active import found:', data);
        return data;
      } catch (error) {
        console.error('💥 [useActiveImport] Error fetching active import:', error);
        return null;
      }
    },
    enabled: !!projectId && enabled,
    refetchInterval: 5000, // Poll every 5 seconds
    refetchIntervalInBackground: false,
    staleTime: 0,
    cacheTime: 0,
  });
}
