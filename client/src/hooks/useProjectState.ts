import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  const [localState, setLocalState] = useState<Partial<ProjectState>>({});

  // Fetch project state
  const { data: projectState, isLoading, error } = useQuery<ProjectState>({
    queryKey: ['project-state', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required');
      
      const response = await fetch(`/api/projects/${projectId}/state`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch project state');
      }
      
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 0, // Always fetch fresh data
  });

  // Save project state mutation
  const saveStateMutation = useMutation({
    mutationFn: async (params: SaveProjectStateParams) => {
      if (!projectId) throw new Error('Project ID is required');
      
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
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch project state
      queryClient.invalidateQueries({ queryKey: ['project-state', projectId] });
    },
  });

  // Auto-save state when local state changes
  const saveState = useCallback(async (params: SaveProjectStateParams) => {
    try {
      await saveStateMutation.mutateAsync(params);
      setLocalState(params);
    } catch (error) {
      console.error('Failed to save project state:', error);
    }
  }, [saveStateMutation]);

  // Save state on step change
  const setCurrentStep = useCallback(async (step: number, additionalData?: Record<string, any>) => {
    const currentState = projectState || localState;
    
    await saveState({
      currentStep: step,
      stepData: {
        ...currentState.stepData,
        ...additionalData,
      },
      importJobId: currentState.importJobId,
      seoProfile: currentState.seoProfile || {},
    });
  }, [projectState, localState, saveState]);

  // Save import job ID
  const setImportJobId = useCallback(async (jobId: string) => {
    const currentState = projectState || localState;
    
    await saveState({
      currentStep: currentState.currentStep || 1,
      stepData: currentState.stepData || {},
      importJobId: jobId,
      seoProfile: currentState.seoProfile || {},
    });
  }, [projectState, localState, saveState]);

  // Save SEO profile
  const setSeoProfile = useCallback(async (profile: Record<string, any>) => {
    const currentState = projectState || localState;
    
    await saveState({
      currentStep: currentState.currentStep || 1,
      stepData: currentState.stepData || {},
      importJobId: currentState.importJobId,
      seoProfile: profile,
    });
  }, [projectState, localState, saveState]);

  // Save step data
  const setStepData = useCallback(async (data: Record<string, any>) => {
    const currentState = projectState || localState;
    
    await saveState({
      currentStep: currentState.currentStep || 1,
      stepData: {
        ...currentState.stepData,
        ...data,
      },
      importJobId: currentState.importJobId,
      seoProfile: currentState.seoProfile || {},
    });
  }, [projectState, localState, saveState]);

  // Initialize local state from server state
  useEffect(() => {
    if (projectState && !localState.currentStep) {
      setLocalState(projectState);
    }
  }, [projectState, localState.currentStep]);

  return {
    // State
    projectState: projectState || localState,
    isLoading,
    error,
    
    // Actions
    saveState,
    setCurrentStep,
    setImportJobId,
    setSeoProfile,
    setStepData,
    
    // Mutation state
    isSaving: saveStateMutation.isPending,
    saveError: saveStateMutation.error,
  };
}




