import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Zap, RefreshCw, CheckCircle2, AlertCircle, Eye, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface GenerationProgress {
  phase: string;
  percent: number;
  generated: number;
  rejected: number;
  processed: number;
  total: number;
}

interface GenerationRun {
  runId: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  totalCandidates: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
}

const PHASE_LABELS: Record<string, string> = {
  'loading': 'Загрузка данных',
  'similarity': 'Вычисление похожести',
  'filtering': 'Фильтрация кандидатов',
  'validation': 'Проверка ссылок',
  'finalizing': 'Финализация'
};

export default function GenerateLinks() {
  const [, params] = useRoute('/project/:id/generate');
  const [, setLocation] = useLocation();
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Кнопка возврата к проекту
  const handleBackToProject = () => {
    window.location.href = `/project/${projectId}`;
  };
  
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  // Fetch recent generation runs
  const { data: runs, isLoading: runsLoading } = useQuery<GenerationRun[]>({
    queryKey: ['/api/generate/runs', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/generate/runs/${projectId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch generation runs');
      }
      
      return response.json();
    },
    enabled: !!projectId
  });

  // Start generation mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/generate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          importId: 'latest', // Use latest import
          scenarios: ['orphan', 'head', 'depth', 'fresh', 'cross', 'money'],
          scope: { fullProject: true },
          rules: {
            maxLinks: 5,
            minDistance: 150,
            exactPercent: 20
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to start generation');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Генерация запущена",
        description: "Генерация ссылок началась. Следите за прогрессом ниже."
      });
      
      // Refresh runs list
      queryClient.invalidateQueries({ queryKey: ['/api/generate/runs', projectId] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка генерации",
        description: error instanceof Error ? error.message : "Не удалось запустить генерацию",
        variant: "destructive"
      });
    }
  });

  // Setup progress stream when a run is active
  useEffect(() => {
    const activeRun = runs?.find(run => run.status === 'running');
    if (!activeRun) return;

    setCurrentRunId(activeRun.runId);
    
    // Setup Server-Sent Events for progress
    const eventSource = new EventSource(`/api/generate/progress/${activeRun.runId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const progress = JSON.parse(event.data);
        setGenerationProgress(progress);
      } catch (error) {
        console.error('Failed to parse progress data:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('Progress stream error:', error);
      eventSource.close();
    };
    
    setEventSource(eventSource);
    
    return () => {
      eventSource.close();
      setEventSource(null);
    };
  }, [runs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  if (runsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  const activeRun = runs?.find(run => run.status === 'running');
  const latestCompletedRun = runs?.find(run => run.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <Link href={`/project/${projectId}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад к проекту
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                Генерация ссылок
              </h1>
            </div>
            <p className="text-gray-600">
              Автоматическая генерация внутренних ссылок для SEO
            </p>
          </div>
          
          <Button 
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !!activeRun}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Запуск...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Запустить генерацию
              </>
            )}
          </Button>
        </div>

        {/* Active Generation Progress */}
        {activeRun && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" />
                Генерация в процессе
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {generationProgress && (
                <>
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {PHASE_LABELS[generationProgress.phase] || generationProgress.phase}
                      </span>
                      <span>{generationProgress.percent}%</span>
                    </div>
                    <Progress value={generationProgress.percent} className="h-2" />
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-bold text-blue-900">
                        {generationProgress.processed}/{generationProgress.total}
                      </div>
                      <div className="text-sm text-blue-700">Обработано</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-lg font-bold text-green-900">
                        {generationProgress.generated}
                      </div>
                      <div className="text-sm text-green-700">Сгенерировано</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-lg font-bold text-red-900">
                        {generationProgress.rejected}
                      </div>
                      <div className="text-sm text-red-700">Отклонено</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-lg font-bold text-gray-900">
                        {generationProgress.generated + generationProgress.rejected}
                      </div>
                      <div className="text-sm text-gray-700">Всего</div>
                    </div>
                  </div>
                </>
              )}
              
              {!generationProgress && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Инициализация генерации...</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Runs */}
        <Card>
          <CardHeader>
            <CardTitle>История генераций</CardTitle>
          </CardHeader>
          <CardContent>
            {runs && runs.length > 0 ? (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div key={run.runId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={
                            run.status === 'completed' ? 'default' : 
                            run.status === 'running' ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {run.status === 'completed' ? 'Завершено' :
                           run.status === 'running' ? 'В процессе' : 'Ошибка'}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {new Date(run.startedAt).toLocaleString('ru-RU')}
                        </span>
                      </div>
                      
                      {run.status === 'completed' && (
                        <div className="text-sm text-gray-600">
                          {run.acceptedCandidates} принято, {run.rejectedCandidates} отклонено
                        </div>
                      )}
                    </div>
                    
                    {run.status === 'completed' && (
                      <div className="flex gap-2">
                        <Link href={`/project/${projectId}/draft/${run.runId}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            Просмотр
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-2" />
                          Экспорт
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Zap className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Генераций еще не было</p>
                <p className="text-sm">Нажмите кнопку выше для запуска первой генерации</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        {latestCompletedRun && (
          <Card>
            <CardHeader>
              <CardTitle>Быстрые действия</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Link href={`/project/${projectId}/draft/${latestCompletedRun.runId}`}>
                  <Button variant="outline">
                    <Eye className="h-4 w-4 mr-2" />
                    Последний черновик
                  </Button>
                </Link>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Экспорт всех ссылок
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}