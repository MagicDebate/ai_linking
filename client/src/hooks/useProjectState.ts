import { useState, useEffect, useCallback } from 'react';

export interface ProjectState {
  currentStep: number;
  lastCompletedStep: number;
  stepData: Record<string, any>;
  importJobId?: string;
  seoProfile: Record<string, any>;
  hasImports: boolean;
  projectId: string;
}

export interface SaveProjectStateParams {
  currentStep: number;
  stepData?: Record<string, any>;
  importJobId?: string;
  seoProfile?: Record<string, any>;
}

export function useProjectState(projectId: string | undefined) {
  const [state, setState] = useState<Partial<ProjectState>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch project state
  const fetchState = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/state`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch project state');
      }
      
      const data = await response.json();
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Save project state
  const saveState = useCallback(async (params: SaveProjectStateParams) => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`/api/projects/${projectId}/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(params),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save project state');
      }
      
      const data = await response.json();
      setState(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error('Failed to save project state:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
  }, [projectId]);

  // Save state on step change
  const setCurrentStep = useCallback(async (step: number, additionalData?: Record<string, any>) => {
    await saveState({
      currentStep: step,
      stepData: {
        ...state.stepData,
        ...additionalData,
      },
      importJobId: state.importJobId,
      seoProfile: state.seoProfile || {},
    });
  }, [state, saveState]);

  // Save import job ID
  const setImportJobId = useCallback(async (jobId: string) => {
    await saveState({
      currentStep: state.currentStep || 1,
      stepData: state.stepData || {},
      importJobId: jobId,
      seoProfile: state.seoProfile || {},
    });
  }, [state, saveState]);

  // Save SEO profile
  const setSeoProfile = useCallback(async (profile: Record<string, any>) => {
    await saveState({
      currentStep: state.currentStep || 1,
      stepData: state.stepData || {},
      importJobId: state.importJobId,
      seoProfile: profile,
    });
  }, [state, saveState]);

  // Save step data
  const setStepData = useCallback(async (data: Record<string, any>) => {
    await saveState({
      currentStep: state.currentStep || 1,
      stepData: {
        ...state.stepData,
        ...data,
      },
      importJobId: state.importJobId,
      seoProfile: state.seoProfile || {},
    });
  }, [state, saveState]);

  // Fetch state on mount and when projectId changes
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return {
    // State
    projectState: state,
    isLoading,
    error,
    
    // Actions
    saveState,
    setCurrentStep,
    setImportJobId,
    setSeoProfile,
    setStepData,
    refetch: fetchState,
  };
}




