import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Database, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight,
  Loader2 
} from 'lucide-react';
import { ImportStatus } from '@/hooks/useImportStatus';

interface ImportProgressProps {
  importStatus: ImportStatus | null;
  isLoading: boolean;
  onBack: () => void;
  onNext: () => void;
  projectId: string;
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

export function ImportProgress({ 
  importStatus, 
  isLoading, 
  onBack, 
  onNext, 
  projectId 
}: ImportProgressProps) {
  if (isLoading) {
    return (
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="text-gray-600">Загружаем статус импорта...</p>
      </div>
    );
  }

  if (!importStatus) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto" />
        <p className="text-gray-600">Нет активного импорта</p>
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад к загрузке
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      <div className="space-y-4">
        <Database className="h-16 w-16 text-blue-600 mx-auto" />
        <h3 className="text-xl font-semibold text-gray-900">
          Импорт данных
        </h3>
        <p className="text-gray-600">
          Обрабатываем загруженные данные, разбиваем на блоки и создаем эмбеддинги.
        </p>
      </div>

      {/* Отладочная информация */}
      <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
        Debug: status={importStatus.status}, phase={importStatus.phase}, percent={importStatus.percent}%
      </div>

      {/* Основной прогресс */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Общий прогресс</span>
          <span>{importStatus.percent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${importStatus.percent}%` }}
          />
        </div>
      </div>

      {/* Текущая фаза */}
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

      {/* Статистика */}
      {importStatus.stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {importStatus.stats.totalPages || importStatus.pagesTotal || 0}
            </div>
            <div className="text-sm text-gray-600">Страниц</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {importStatus.stats.totalBlocks || importStatus.blocksDone || 0}
            </div>
            <div className="text-sm text-gray-600">Блоков</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {importStatus.stats.totalWords || 0}
            </div>
            <div className="text-sm text-gray-600">Слов</div>
          </div>
        </div>
      )}

      {/* Кнопки действий */}
      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад к загрузке
        </Button>
        
        {importStatus.status === "completed" && (
          <Button 
            onClick={onNext}
            className="bg-green-600 hover:bg-green-700"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Перейти к настройкам SEO
          </Button>
        )}
        
        {importStatus.status === "failed" && (
          <div className="text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-red-600 font-medium">Ошибка импорта</p>
            <p className="text-sm text-gray-600">
              {importStatus.errorMessage || "Произошла ошибка при обработке данных"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
