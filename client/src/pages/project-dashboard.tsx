import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Download, 
  Settings, 
  BarChart3, 
  FileText, 
  Eye,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

interface ProjectMetrics {
  orphanPages: number;
  deepPages: number;
  redirectLinksPercent: number;
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
  seoProfile?: any;
}

interface LastRun {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  percent: number;
  totalUrls: number;
  startedAt: string;
  finishedAt?: string;
}

export default function ProjectDashboard() {
  const [, params] = useRoute('/project/:id');
  const [, setLocation] = useLocation();
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch project data
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['/api/projects', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      return response.json();
    },
    enabled: !!projectId
  });

  // Fetch project metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery<ProjectMetrics>({
    queryKey: ['/api/projects', projectId, 'metrics'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/metrics`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      return response.json();
    },
    enabled: !!projectId
  });

  // Fetch last run
  const { data: lastRun, isLoading: lastRunLoading } = useQuery<LastRun>({
    queryKey: ['/api/projects', projectId, 'last-run'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/last-run`);
      if (!response.ok) throw new Error('Failed to fetch last run');
      return response.json();
    },
    enabled: !!projectId
  });

  // Fetch generation runs history
  const { data: runs, isLoading: runsLoading } = useQuery<GenerationRun[]>({
    queryKey: ['/api/generate/runs', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/generate/runs/${projectId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch generation runs');
      return response.json();
    },
    enabled: !!projectId
  });

  // Download CSV mutation
  const downloadMutation = useMutation({
    mutationFn: async (runId: string) => {
      const response = await fetch(`/api/generate/download/${runId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to download CSV');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `links-${runId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({ title: "CSV скачан успешно!" });
    },
    onError: (error) => {
      toast({ 
        title: "Ошибка скачивания", 
        description: error instanceof Error ? error.message : "Не удалось скачать CSV",
        variant: "destructive" 
      });
    }
  });

  const handleDownload = (runId: string) => {
    downloadMutation.mutate(runId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Загрузка проекта...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад к проектам
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                {project?.name || 'Проект'}
              </h1>
            </div>
            <p className="text-gray-600">
              {project?.domain || 'Домен не указан'}
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline"
              onClick={() => setLocation(`/project/${projectId}/upload`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Загрузить CSV
            </Button>
            <Button 
              onClick={() => setLocation(`/project/${projectId}/generate`)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Settings className="h-4 w-4 mr-2" />
              Настройки генерации
            </Button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Сироты</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? '...' : metrics?.orphanPages || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                страниц без входящих
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Глубокие страницы</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? '...' : metrics?.deepPages || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                P95 click depth > 3
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Редиректы</CardTitle>
              <BarChart3 className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metricsLoading ? '...' : `${metrics?.redirectLinksPercent || 0}%`}
              </div>
              <p className="text-xs text-muted-foreground">
                внутр. ссылки → редирект
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Last Run */}
        {lastRun && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Последний запуск
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(lastRun.status)}
                  <Badge className={getStatusColor(lastRun.status)}>
                    {lastRun.status === 'completed' ? 'Завершено' :
                     lastRun.status === 'running' ? 'В процессе' : 'Ошибка'}
                  </Badge>
                  <span className="text-sm text-gray-500">
                    {new Date(lastRun.startedAt).toLocaleString('ru-RU')}
                  </span>
                </div>
                {lastRun.status === 'completed' && (
                  <Button 
                    size="sm"
                    onClick={() => handleDownload(lastRun.runId)}
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Скачать CSV
                  </Button>
                )}
              </div>

              {lastRun.status === 'running' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Прогресс</span>
                    <span>{lastRun.percent}%</span>
                  </div>
                  <Progress value={lastRun.percent} className="h-2" />
                </div>
              )}

              {lastRun.status === 'completed' && (
                <div className="text-sm text-gray-600">
                  Обработано URL: {lastRun.totalUrls}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Runs History */}
        <Card>
          <CardHeader>
            <CardTitle>История запусков</CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Загрузка истории...</p>
              </div>
            ) : runs && runs.length > 0 ? (
              <div className="space-y-3">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.runId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(run.status)}
                        <Badge className={getStatusColor(run.status)}>
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
                    
                    <div className="flex gap-2">
                      {run.status === 'completed' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDownload(run.runId)}
                          disabled={downloadMutation.isPending}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          CSV
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setLocation(`/project/${projectId}/draft/${run.runId}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Запусков еще не было</p>
                <p className="text-sm">Нажмите "Настройки генерации" для запуска первой генерации</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
