import { useState, useEffect } from "react";
import { useRoute } from "wouter";
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
  TrendingUp
} from "lucide-react";

interface ImportStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  phase: string;
  percent: number;
  pagesTotal: number;
  pagesDone: number;
  blocksDone: number;
  orphanCount: number;
  avgWordCount: number;
  deepPages: number;
  avgClickDepth: number;
  importDuration?: number;
  logs: string[];
  errorMessage?: string;
  startedAt: string;
  finishedAt?: string;
}

const phaseLabels: Record<string, string> = {
  loading: "Загрузка источника",
  cleaning: "Очистка от boilerplate",
  chunking: "Нарезка на блоки", 
  extracting: "Извлечение метаданных",
  embedding: "Генерация эмбеддингов",
  graphing: "Обновление графа",
  finalizing: "Финализация"
};

export function ImportPage() {
  const [, params] = useRoute("/project/:id/import");
  const projectId = params?.id;
  const [jobId, setJobId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  // Poll import status every 2 seconds
  const { data: importStatus, refetch, isError } = useQuery<ImportStatus>({
    queryKey: ["/api/import/status", projectId],
    queryFn: async () => {
      const url = new URL(`/api/import/status`, window.location.origin);
      url.searchParams.set('projectId', projectId!);
      if (jobId) {
        url.searchParams.set('jobId', jobId);
      }
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch import status');
      }
      
      return response.json();
    },
    enabled: !!projectId && autoRefresh,
    refetchInterval: 2000,
  });

  // Start import when coming from Step 3
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const startJobId = urlParams.get("jobId");
    
    if (startJobId) {
      setJobId(startJobId);
    }
  }, []);

  // Stop auto-refresh when job is completed/failed/canceled
  useEffect(() => {
    if (importStatus && ["completed", "failed", "canceled"].includes(importStatus.status)) {
      setAutoRefresh(false);
    }
  }, [importStatus]);

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
        setAutoRefresh(false);
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
    // Navigate to Step 5 or generation results
    window.location.href = `/project/${projectId}?step=5`;
  };

  if (!projectId) {
    return <div>Project not found</div>;
  }

  if (isError) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Импорт не найден</h2>
            <p className="text-gray-600 mb-4">
              Импорт джоб не найден или истек. Возможно, сервер был перезапущен.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.location.href = `/project/${projectId}`}>
                Вернуться к проекту
              </Button>
              <Button onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Попробовать снова
              </Button>
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
            <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
            <div className="space-y-3">
              <p>Загрузка статуса импорта...</p>
              <p className="text-sm text-gray-500">
                Project ID: {projectId}, Job ID: {jobId || 'не указан'}
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = `/project/${projectId}`}
              >
                Вернуться к проекту
              </Button>
            </div>
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
          <Badge className={getStatusColor(importStatus.status)}>
            {getStatusIcon(importStatus.status)}
            <span className="ml-2 capitalize">{importStatus.status}</span>
          </Badge>
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
              <div>
                <p className="font-medium text-blue-900">
                  Текущая фаза: {phaseLabels[importStatus.phase] || importStatus.phase}
                </p>
                {importStatus.status === "running" && (
                  <p className="text-sm text-blue-700">
                    Обработка в процессе...
                  </p>
                )}
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <FileText className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.pagesDone}
                </div>
                <div className="text-sm text-gray-600">
                  из {importStatus.pagesTotal || "?"} страниц
                </div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <Database className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.blocksDone}
                </div>
                <div className="text-sm text-gray-600">блоков</div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <LinkIcon className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.orphanCount}
                </div>
                <div className="text-sm text-gray-600">сирот</div>
              </div>

              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <TrendingUp className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">
                  {importStatus.avgClickDepth.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">глубина</div>
              </div>
            </div>

            {/* Additional Stats */}
            {importStatus.status === "completed" && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-semibold">{importStatus.avgWordCount}</div>
                  <div className="text-sm text-gray-600">слов на страницу</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{importStatus.deepPages}</div>
                  <div className="text-sm text-gray-600">глубоких страниц</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {importStatus.status === "running" && (
            <Button variant="outline" onClick={handleCancelImport}>
              <Square className="h-4 w-4 mr-2" />
              Отменить импорт
            </Button>
          )}

          {importStatus.status === "completed" && (
            <Button onClick={handleGenerateLinks} className="bg-green-600 hover:bg-green-700">
              <Play className="h-4 w-4 mr-2" />
              Сгенерировать ссылки
            </Button>
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
        </div>

        {/* Error Message */}
        {importStatus.errorMessage && (
          <Card className="border-red-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-900 mb-1">Ошибка импорта</h4>
                  <p className="text-red-700">{importStatus.errorMessage}</p>
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
              <CardTitle className="text-lg">Логи консоли</CardTitle>
              {showLogs ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
          </CardHeader>
          {showLogs && (
            <CardContent>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-60 overflow-y-auto">
                {importStatus.logs.length > 0 ? (
                  importStatus.logs.slice(-20).map((log, index) => (
                    <div key={index} className="mb-1">
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">Логи пока отсутствуют...</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}