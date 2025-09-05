import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useGenerationLogs } from '@/hooks/useGenerationLogs';
import { RefreshCw, Download, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface GenerationLogsProps {
  runId: string | null;
  enabled?: boolean;
}

export default function GenerationLogs({ runId, enabled = true }: GenerationLogsProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const { data: logsData, isLoading, error, refetch } = useGenerationLogs(runId, enabled && showLogs);

  const formatLogLine = (line: string) => {
    // Парсим timestamp
    const timestampMatch = line.match(/^\[([^\]]+)\]/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    const content = timestampMatch ? line.substring(timestampMatch[0].length).trim() : line;
    
    // Определяем тип лога по эмодзи
    let logType = 'info';
    let emoji = '';
    
    if (content.includes('🔍')) {
      logType = 'debug';
      emoji = '🔍';
    } else if (content.includes('✅')) {
      logType = 'success';
      emoji = '✅';
    } else if (content.includes('❌')) {
      logType = 'error';
      emoji = '❌';
    } else if (content.includes('⚠️')) {
      logType = 'warning';
      emoji = '⚠️';
    } else if (content.includes('🔗')) {
      logType = 'scenario';
      emoji = '🔗';
    }

    return { timestamp, content, logType, emoji };
  };

  const getLogTypeColor = (logType: string) => {
    switch (logType) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'scenario': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'debug': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (!runId) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            📋 Логи генерации
            {logsData && (
              <Badge variant="outline" className="ml-2">
                {logsData.logs.length} строк
              </Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showLogs ? 'Скрыть' : 'Показать'}
            </Button>
            
            {showLogs && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Обновить
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? '🔒' : '🔓'} Автоскролл
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      {showLogs && (
        <CardContent className="pt-0">
          {isLoading && !logsData && (
            <div className="text-center py-4">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Загрузка логов...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-medium">Ошибка загрузки логов:</p>
              <p className="text-red-600 text-sm mt-1">{error.message}</p>
            </div>
          )}

          {logsData && (
            <>
              <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
                <span>Статус: <Badge variant="outline">{logsData.status}</Badge></span>
                <span>Создано: {new Date(logsData.createdAt).toLocaleString()}</span>
                <span>Всего строк: {logsData.totalLines}</span>
              </div>

              <ScrollArea className="h-96 w-full border rounded-lg">
                <div className="p-4 space-y-1">
                  {logsData.logs.map((line, index) => {
                    const { timestamp, content, logType, emoji } = formatLogLine(line);
                    
                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-2 p-2 rounded text-xs font-mono border ${getLogTypeColor(logType)}`}
                      >
                        <span className="text-gray-500 flex-shrink-0 w-20">
                          {timestamp ? new Date(timestamp).toLocaleTimeString() : ''}
                        </span>
                        
                        <span className="flex-shrink-0">
                          {emoji}
                        </span>
                        
                        <span className="flex-1 break-all">
                          {content}
                        </span>
                      </div>
                    );
                  })}
                  
                  {logsData.logs.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>Логи пока не доступны</p>
                      <p className="text-sm mt-1">Запустите генерацию, чтобы увидеть логи</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 border border-green-200 rounded"></span>
                    Успех
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-100 border border-red-200 rounded"></span>
                    Ошибка
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></span>
                    Сценарий
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></span>
                    Отладка
                  </span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const logText = logsData.logs.join('\n');
                    const blob = new Blob([logText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `generation-logs-${runId}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Скачать
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
