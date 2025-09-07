import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Square,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Link as LinkIcon,
  FileText,
  TrendingUp,
  ArrowLeft,
  Home
} from "lucide-react";

interface ImportStatus {
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  phase: string;
  percent: number;
  currentItem: string | null;
  error: string | null;
  stats: {
    totalPages: number;
    totalBlocks: number;
    totalWords: number;
  };
  errors: string[];
  // Legacy fields for backward compatibility
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

const phaseLabels: Record<string, string> = {
  loading: "Загрузка источника",
  cleaning: "Очистка от boilerplate",
  chunking: "Нарезка на блоки", 
  extracting: "Извлечение метаданных",
  vectorizing: "Генерация эмбеддингов",
  graphing: "Обновление графа",
  finalizing: "Финализация",
  error: "Ошибка обработки"
};

const phaseDescriptions: Record<string, string> = {
  loading: "Читаем CSV файл и подготавливаем данные",
  cleaning: "Удаляем HTML теги, скрипты и стили",
  chunking: "Разбиваем контент на смысловые блоки",
  extracting: "Извлекаем метаданные и ключевые слова",
  vectorizing: "Создаем векторные представления для поиска",
  graphing: "Строим граф внутренних ссылок",
  finalizing: "Завершаем обработку и сохраняем результаты",
  error: "Произошла ошибка при обработке"
};

export function ImportPage() {
  const [, params] = useRoute("/project/:id/import");
  const projectId = params?.id;
  const [jobId, setJobId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true); // Всегда включено
  const { toast } = useToast();

  // Функция для поиска последнего job для проекта
  const findLatestJobForProject = async () => {
    if (!projectId) return;
    
    try {
      console.log('🔍 Searching for latest job for project:', projectId);
      const response = await fetch(`/api/import/jobs/${projectId}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const jobs = await response.json();
        if (jobs && jobs.length > 0) {
          const latestJob = jobs[0]; // Предполагаем, что jobs отсортированы по дате
          console.log('✅ Found latest job:', latestJob.jobId);
          setJobId(latestJob.jobId);
        } else {
          console.log('⚠️ No jobs found for project');
        }
      } else {
        console.log('❌ Failed to fetch jobs for project');
      }
    } catch (error) {
      console.error('❌ Error finding latest job:', error);
    }
  };

  // Poll import status every 1 second for better responsiveness
  const { data: importStatus, refetch, isError, isFetching } = useQuery<ImportStatus>({
    queryKey: ["/api/import/status", projectId, jobId],
    queryFn: async () => {
      if (!jobId) {
        console.log('❌ No jobId available for API call');
        throw new Error('JobId is required');
      }
      
      const url = new URL(`/api/import/status/${jobId}`, window.location.origin);
      
      console.log('🔍 Fetching import status:', { projectId, jobId, url: url.toString() });
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.log('❌ API response not ok:', response.status, response.statusText);
        throw new Error('Failed to fetch import status');
      }
      
      const data = await response.json();
      console.log('📊 Import status response:', {
        status: data.status,
        phase: data.phase,
        percent: data.percent,
        currentItem: data.currentItem,
        pagesTotal: data.pagesTotal,
        pagesDone: data.pagesDone,
        blocksDone: data.blocksDone
      });
      return data;
    },
    enabled: !!projectId && !!jobId,
    refetchInterval: 1000, // Принудительно каждую секунду
    refetchIntervalInBackground: true,
    staleTime: 0, // Всегда считаем данные устаревшими
    cacheTime: 0, // Отключаем кэш полностью
    retry: 3,
    retryDelay: 1000,
  });

  // Start import when coming from Step 3
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const startJobId = urlParams.get("jobId");
    
    console.log('ImportPage useEffect:', { 
      projectId, 
      startJobId, 
      urlParams: urlParams.toString(),
      currentUrl: window.location.href 
    });
    
    if (startJobId) {
      setJobId(startJobId);
      console.log('✅ Set jobId to:', startJobId);
    } else {
      // Если jobId не указан в URL, попробуем найти последний джоб для проекта
      console.log('⚠️ No jobId in URL, will try to find latest job for project');
      findLatestJobForProject();
    }
  }, [projectId]);

  // Log when jobId changes
  useEffect(() => {
    console.log('🔄 jobId changed:', jobId);
  }, [jobId]);

  // Log import status changes and force refetch
  useEffect(() => {
    if (importStatus) {
      console.log('🔄 Import status changed:', importStatus.status, importStatus.phase, importStatus.percent);
    }
    
    // Принудительно обновляем каждые 2 секунды
    const interval = setInterval(() => {
      if (jobId) {
        console.log('🔄 Force refetching import status');
        refetch();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [importStatus, jobId, refetch]);

  const handleCancelImport = async () => {
    if (!jobId) return;

    try {
      const response = await fetch("/api/import/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId }),
      });

      if (response.ok) {
        toast({
          title: "Импорт отменен",
          description: "Процесс импорта был остановлен",
        });
        refetch();
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отменить импорт",
        variant: "destructive",
      });
    }
  };

  const handleDownloadLogs = () => {
    if (!jobId) return;
    window.open(`/api/import/logs/${jobId}`, "_blank");
  };

  const handleGenerateLinks = () => {
    // Navigate to generation page
    window.location.href = `/project/${projectId}/generate`;
  };

  if (!projectId) {
    return <div>Project not found</div>;
  }

  // Автоматическое перенаправление если нет jobId
  useEffect(() => {
    if (!jobId && !isError) {
      console.log('🔄 No jobId found, redirecting to project page');
      window.location.href = `/project/${projectId}`;
    }
  }, [jobId, isError, projectId]);

  if (isError || !jobId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {!jobId ? 'Перенаправление...' : 'Импорт не найден'}
            </h2>
            <p className="text-gray-600 mb-4">
              {!jobId 
                ? 'Вы перешли на страницу импорта, но для этого проекта еще не был запущен импорт. Система перенаправит вас на правильный этап работы с проектом.'
                : 'Импорт джоб не найден или истек. Возможно, сервер был перезапущен.'
              }
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.location.href = `/project/${projectId}`}>
                Вернуться к проекту
              </Button>
              {!jobId && (
                <Button onClick={() => window.location.href = `/project/${projectId}`}>
                  Продолжить работу с проектом
                </Button>
              )}
              {jobId && (
                <Button onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Попробовать снова
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!importStatus) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-8 text-center">
            {!jobId ? (
              <div className="space-y-4">
                <Database className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900">Импорт данных</h2>
                <p className="text-gray-600">
                  Для этого проекта еще не запущен импорт. Запустите импорт для обработки загруженных данных.
                </p>
                <div className="flex gap-2 justify-center">
                  <Button 
                    onClick={() => window.location.href = `/project/${projectId}/upload`}
                    variant="outline"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Вернуться к загрузке
                  </Button>
                  <Button 
                    onClick={() => window.location.href = `/project/${projectId}`}
                    variant="outline"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    К проекту
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
                <p>Загрузка статуса импорта...</p>
                <p className="text-sm text-gray-500">
                  Project ID: {projectId}, Job ID: {jobId || 'не указан'}
                </p>
                <p className="text-sm text-gray-500">
                  Auto Refresh: {autoRefresh ? 'Включено' : 'Выключено'}, 
                  Is Fetching: {isFetching ? 'Да' : 'Нет'}, 
                  Is Error: {isError ? 'Да' : 'Нет'}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => refetch()}
                  >
                    Обновить вручную
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = `/project/${projectId}`}
                  >
                    Вернуться к проекту
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "canceled":
        return <Square className="h-5 w-5 text-gray-500" />;
      default:
        return <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "failed": return "bg-red-100 text-red-800";
      case "canceled": return "bg-gray-100 text-gray-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <Home className="w-4 h-4 mr-2" />
              Главная
            </Button>
          </Link>
          <Link href={`/project/${projectId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              К проекту
            </Button>
          </Link>
        </div>
        <div className="text-sm text-muted-foreground">
          Проект: {projectId?.slice(0, 8)}...
        </div>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Импорт и индексация
            </h1>
            <p className="text-gray-600">
              Обработка данных для создания внутренних ссылок
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                console.log('🔄 Manual refresh clicked');
                refetch();
              }}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            {isFetching && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Обновление...
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Badge className={getStatusColor(importStatus.status)}>
              {getStatusIcon(importStatus.status)}
              <span className="ml-2 capitalize">{importStatus.status}</span>
            </Badge>
          </div>
        </div>

        {/* Progress Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Прогресс импорта
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Общий прогресс</span>
                <span>{importStatus.percent}%</span>
              </div>
              <Progress value={importStatus.percent} className="h-3" />
            </div>

            {/* Current Phase */}
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-blue-900">
                  Текущая фаза: {phaseLabels[importStatus.phase] || importStatus.phase}
                </p>
                  <p className="text-sm text-blue-700">
                  {phaseDescriptions[importStatus.phase] || "Обработка данных..."}
                  </p>
                {importStatus.status === "running" && (
                  <div className="mt-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <FileText className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.pagesTotal || importStatus.stats?.totalPages || 0}
                </div>
                <div className="text-sm text-gray-600">
                  страниц обработано
                </div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Database className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.blocksDone || importStatus.stats?.totalBlocks || 0}
                </div>
                <div className="text-sm text-gray-600">блоков</div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <LinkIcon className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.orphanCount || 0}
                </div>
                <div className="text-sm text-gray-600">сирот</div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <TrendingUp className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {(importStatus?.avgClickDepth || 0).toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">глубина</div>
              </div>
            </div>

            {/* Additional Stats */}
            {importStatus.status === "completed" && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-semibold">{importStatus.avgWordCount || importStatus.stats?.totalWords || 0}</div>
                  <div className="text-sm text-gray-600">слов проанализировано</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{importStatus.deepPages || 0}</div>
                  <div className="text-sm text-gray-600">глубоких страниц</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary - Show when completed */}
        {importStatus.status === "completed" && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle2 className="h-5 w-5" />
                Импорт успешно завершен!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">
                    {importStatus.pagesTotal || importStatus.stats?.totalPages || 0}
                  </div>
                  <div className="text-sm text-green-700">страниц обработано</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">
                    {importStatus.blocksDone || importStatus.stats?.totalBlocks || 0}
                  </div>
                  <div className="text-sm text-green-700">блоков создано</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">
                    {importStatus.orphanCount || 0}
                  </div>
                  <div className="text-sm text-green-700">сирот найдено</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">
                    {(importStatus?.avgClickDepth || 0).toFixed(1)}
                  </div>
                  <div className="text-sm text-green-700">средняя глубина</div>
                </div>
              </div>
              <div className="text-sm text-green-700">
                Теперь вы можете сгенерировать внутренние ссылки для улучшения SEO вашего сайта.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          {importStatus.status === "running" && (
            <Button variant="outline" onClick={handleCancelImport}>
              <Square className="h-4 w-4 mr-2" />
              Отменить импорт
            </Button>
          )}

          {importStatus.status === "completed" && (
            <>
              <Button onClick={handleGenerateLinks} className="bg-green-600 hover:bg-green-700">
                <Play className="h-4 w-4 mr-2" />
                Сгенерировать ссылки
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.open(`/project/${projectId}/debug`, '_blank')}
                className="border-orange-300 text-orange-600 hover:bg-orange-50"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Отладка данных
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.href = `/project/${projectId}`}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Вернуться к проекту
              </Button>
            </>
          )}

          {importStatus.status === "failed" && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Повторить импорт
            </Button>
          )}

          <Button variant="outline" onClick={handleDownloadLogs}>
            <Download className="h-4 w-4 mr-2" />
            Скачать логи
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

                 {/* Error Message */}
         {importStatus.error && (
           <Card className="border-red-200">
             <CardContent className="p-4">
               <div className="flex items-start gap-3">
                 <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                 <div>
                   <h4 className="font-medium text-red-900 mb-1">Ошибка импорта</h4>
                   <p className="text-red-700">{importStatus.error}</p>
                 </div>
               </div>
             </CardContent>
           </Card>
         )}

        {/* Logs Accordion */}
        <Card>
          <CardHeader className="pb-3">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowLogs(!showLogs)}
            >
              <CardTitle className="text-lg flex items-center gap-2">
                                 <FileText className="h-5 w-5" />
                 Технические логи
                 {importStatus.errors.length > 0 && (
                   <Badge variant="secondary" className="ml-2">
                     {importStatus.errors.length}
                   </Badge>
                 )}
              </CardTitle>
              {showLogs ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </CardHeader>
          {showLogs && (
            <CardContent>
                             <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-80 overflow-y-auto">
                 {importStatus.errors.length > 0 ? (
                   <div className="space-y-1">
                     {importStatus.errors.slice(-50).map((log, index) => {
                       const isError = log.includes('❌') || log.includes('ERROR');
                       const isSuccess = log.includes('✅') || log.includes('SUCCESS');
                       const isProgress = log.includes('📈') || log.includes('%');
                       
                       return (
                         <div 
                           key={index} 
                           className={`${
                             isError ? 'text-red-400' : 
                             isSuccess ? 'text-green-400' : 
                             isProgress ? 'text-yellow-400' : 
                             'text-green-400'
                           }`}
                         >
                       {log}
                     </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div className="text-gray-500">Логи пока отсутствуют...</div>
                 )}
               </div>
              <div className="mt-3 text-xs text-gray-500">
                Показываются последние 50 записей. Полные логи можно скачать кнопкой выше.
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}