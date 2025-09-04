import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export function useProjectMutations() {
  const { toast } = useToast();

  const handleError = (error: any, title: string) => {
    console.error(`❌ ${title}:`, error);
    const errorMessage = error?.message || 'Неизвестная ошибка';
    toast({ 
      title, 
      description: errorMessage, 
      variant: "destructive" 
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ file, projectId }: { file: File; projectId: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }
      
      return response.json();
    },
    onError: (error: any) => handleError(error, "Ошибка загрузки")
  });

  const mappingMutation = useMutation({
    mutationFn: async ({ 
      projectId, 
      fieldMapping, 
      uploadId 
    }: { 
      projectId: string; 
      fieldMapping: Record<string, string>; 
      uploadId: string; 
    }) => {
      const response = await fetch('/api/field-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId, 
          fieldMapping,
          uploadId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Mapping save failed');
      }
      
      return response.json();
    },
    onError: (error: any) => handleError(error, "Ошибка сохранения маппинга")
  });

  const startImportMutation = useMutation({
    mutationFn: async ({ 
      projectId, 
      uploadId 
    }: { 
      projectId: string; 
      uploadId: string; 
    }) => {
      console.log('📤 Starting import with data:', { projectId, uploadId });
      
      const response = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          uploadId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Import start failed');
      }
      
      const result = await response.json();
      console.log('✅ Import start response:', result);
      return result;
    },
    onError: (error: any) => handleError(error, "Ошибка запуска импорта")
  });

  const generateLinksMutation = useMutation({
    mutationFn: async ({ 
      projectId, 
      seoProfile 
    }: { 
      projectId: string; 
      seoProfile: any; 
    }) => {
      console.log('🚀 Sending full SEO profile to backend:', seoProfile);
      
      const response = await fetch('/api/generate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          seoProfile
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start generation');
      }
      
      return response.json();
    },
    onError: (error: any) => handleError(error, "Ошибка генерации")
  });

  return {
    uploadMutation,
    mappingMutation,
    startImportMutation,
    generateLinksMutation
  };
}






