import { useCallback } from 'react';
import { useLocation } from 'wouter';

export interface ProjectNavigation {
  navigateToStep: (step: number, projectId: string) => Promise<void>;
  getCurrentStep: (location: string) => number;
  getStepUrl: (step: number, projectId: string) => string;
}

export function useProjectNavigation(): ProjectNavigation {
  const [, setLocation] = useLocation();

  const getStepUrl = useCallback((step: number, projectId: string): string => {
    const stepUrls = {
      1: `/project/${projectId}/upload`,
      2: `/project/${projectId}/import-progress`,
      3: `/project/${projectId}/seo`,
      4: `/project/${projectId}/generate`,
      5: `/project/${projectId}/draft`,
      6: `/project/${projectId}/publish`
    };
    
    return stepUrls[step as keyof typeof stepUrls] || `/project/${projectId}/upload`;
  }, []);

  const getCurrentStep = useCallback((location: string): number => {
    if (location.includes('/upload')) return 1;
    if (location.includes('/import-progress')) return 2;
    if (location.includes('/seo')) return 3;
    if (location.includes('/generate')) return 4;
    if (location.includes('/draft')) return 5;
    if (location.includes('/publish')) return 6;
    return 1; // по умолчанию
  }, []);

  const navigateToStep = useCallback(async (step: number, projectId: string): Promise<void> => {
    if (!projectId) {
      console.error('❌ ProjectId is undefined, cannot navigate');
      return;
    }
    
    const targetUrl = getStepUrl(step, projectId);
    console.log(`🔀 Navigating to step ${step}: ${targetUrl}`);
    setLocation(targetUrl);
  }, [getStepUrl, setLocation]);

  return {
    navigateToStep,
    getCurrentStep,
    getStepUrl
  };
}
