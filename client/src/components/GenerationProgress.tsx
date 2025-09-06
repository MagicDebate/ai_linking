import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  FileText,
  Target,
  Link,
  TrendingUp,
  ArrowUp,
  RefreshCw,
  Eye,
  Download
} from 'lucide-react';

interface TaskProgress {
  percent: number;
  scanned: number;
  candidates: number;
  accepted: number;
  rejected: number;
}

interface GenerationProgressProps {
  runId: string;
  status: 'running' | 'draft' | 'published' | 'failed' | 'canceled';
  phase: string;
  percent: number;
  generated: number;
  rejected: number;
  taskProgress: {
    pages?: {
      processed: number;
      total: number;
      percent: number;
    };
    links?: {
      total: number;
      generated: number;
      rejected: number;
    };
    scenarios?: {
      [key: string]: {
        status: string;
        generated: number;
        rejected: number;
      };
    };
    timing?: {
      startedAt: string;
      estimatedRemaining?: number;
    };
  };
  counters: {
    scanned: number;
    candidates: number;
    accepted: number;
    rejected: number;
  };
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}

const taskConfig = {
  orphanFix: {
    title: 'Orphan Fix',
    description: 'Исправление «сиротских» страниц',
    icon: <FileText className="h-4 w-4" />,
    color: 'bg-blue-500'
  },
  headConsolidation: {
    title: 'Head Consolidation',
    description: 'Консолидация заголовков',
    icon: <Target className="h-4 w-4" />,
    color: 'bg-green-500'
  },
  clusterCrossLink: {
    title: 'Cluster Cross-Link',
    description: 'Перелинковка внутри кластеров',
    icon: <Link className="h-4 w-4" />,
    color: 'bg-purple-500'
  },
  commercialRouting: {
    title: 'Commercial Routing',
    description: 'Перелив на Money Pages',
    icon: <TrendingUp className="h-4 w-4" />,
    color: 'bg-orange-500'
  },
  depthLift: {
    title: 'Depth Lift',
    description: 'Поднятие глубоко вложенных страниц',
    icon: <ArrowUp className="h-4 w-4" />,
    color: 'bg-indigo-500'
  },
  freshnessPush: {
    title: 'Freshness Push',
    description: 'Подсветка свежего контента',
    icon: <RefreshCw className="h-4 w-4" />,
    color: 'bg-pink-500'
  }
};

export function GenerationProgress({
  runId,
  status,
  phase,
  percent,
  generated,
  rejected,
  taskProgress,
  counters,
  startedAt,
  finishedAt,
  errorMessage
}: GenerationProgressProps) {
  console.log('🔍 [GenerationProgress] Component rendered with props:', {
    runId,
    status,
    phase,
    percent,
    generated,
    rejected,
    taskProgress,
    counters,
    startedAt,
    finishedAt,
    errorMessage
  });
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Play className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'draft':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'published':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'canceled':
        return <XCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Выполняется';
      case 'draft':
        return 'Черновик готов';
      case 'published':
        return 'Опубликовано';
      case 'failed':
        return 'Ошибка';
      case 'canceled':
        return 'Отменено';
      default:
        return 'Неизвестно';
    }
  };

  const getPhaseText = () => {
    switch (phase) {
      case 'starting':
        return 'Инициализация...';
      case 'analyzing':
        return 'Анализ страниц...';
      case 'generating':
        return 'Генерация ссылок...';
      case 'checking_404':
        return 'Проверка ссылок...';
      case 'finalizing':
        return 'Завершение...';
      default:
        return phase;
    }
  };

  return (
    <div className="space-y-6">
      {/* Основной прогресс */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Генерация ссылок
            <Badge variant={status === 'running' ? 'default' : status === 'draft' ? 'secondary' : 'outline'}>
              {getStatusText()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Общий прогресс */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Общий прогресс</span>
              <span>{percent}%</span>
            </div>
            <Progress value={percent} className="h-2" />
            <p className="text-sm text-gray-600">{getPhaseText()}</p>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{taskProgress?.pages?.processed || 0}</div>
              <div className="text-sm text-gray-600">Просмотрено</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{taskProgress?.links?.total || 0}</div>
              <div className="text-sm text-gray-600">Кандидатов</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{generated || 0}</div>
              <div className="text-sm text-gray-600">Принято</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{rejected || 0}</div>
              <div className="text-sm text-gray-600">Отклонено</div>
            </div>
          </div>

          {/* Время */}
          <div className="text-sm text-gray-500">
            <div>Начато: {new Date(startedAt).toLocaleString('ru-RU')}</div>
            {finishedAt && (
              <div>Завершено: {new Date(finishedAt).toLocaleString('ru-RU')}</div>
            )}
          </div>

          {/* Ошибка */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-700">{errorMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Прогресс по задачам */}
      <Card>
        <CardHeader>
          <CardTitle>Прогресс по задачам</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {taskProgress?.scenarios && Object.entries(taskProgress.scenarios).map(([taskKey, progress]) => {
            const config = taskConfig[taskKey as keyof typeof taskConfig];
            if (!config) return null;
            
            // Вычисляем процент выполнения на основе статуса
            const percent = progress.status === 'completed' ? 100 : 0;
            const totalCandidates = progress.generated + progress.rejected;
            
            return (
              <div key={taskKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded ${config.color || 'bg-gray-500'} text-white`}>
                      {config.icon}
                    </div>
                    <div>
                      <div className="font-medium">{config.title}</div>
                      <div className="text-sm text-gray-600">{config.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{percent}%</div>
                    <div className="text-sm text-gray-600">
                      {progress.generated} / {totalCandidates}
                    </div>
                  </div>
                </div>
                <Progress value={percent} className="h-2" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Просмотрено: {taskProgress.pages?.processed || 0}</span>
                  <span>Кандидатов: {totalCandidates}</span>
                  <span>Принято: {progress.generated}</span>
                  <span>Отклонено: {progress.rejected}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Кнопки действий */}
      {(status === 'draft' || status === 'published' || (status === 'running' && generated > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle>Результаты генерации</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              <Button 
                variant="outline"
                onClick={() => {
                  // Переходим на страницу просмотра результатов
                  window.open(`/draft/${runId}`, '_blank');
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                Просмотреть ссылки
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  // Скачиваем CSV файл
                  window.open(`/api/generate/download/${runId}`, '_blank');
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Скачать CSV
              </Button>
            </div>
            
            {generated > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Готово!</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  Найдено {generated} ссылок. Нажмите "Просмотреть ссылки" для детального просмотра.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
