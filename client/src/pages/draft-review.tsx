import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Filter, ExternalLink, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';

interface LinkCandidate {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  scenario: string;
  isRejected: boolean;
  rejectionReason?: string;
  similarity?: number;
  position: number;
}

interface DraftStats {
  scenario: string;
  total: number;
  accepted: number;
  rejected: number;
}

interface DraftData {
  candidates: LinkCandidate[];
  total: number;
  stats: DraftStats[];
}

const SCENARIO_LABELS: Record<string, string> = {
  orphan: 'Поднятие сирот',
  head: 'Консолидация голов',
  depth: 'Поднятие глубоких',
  fresh: 'Продвижение свежих',
  cross: 'Кросс-линковка',
  money: 'Коммерческий роутинг'
};

const SCENARIO_COLORS: Record<string, string> = {
  orphan: 'bg-red-100 text-red-800',
  head: 'bg-blue-100 text-blue-800',
  depth: 'bg-purple-100 text-purple-800',
  fresh: 'bg-green-100 text-green-800',
  cross: 'bg-yellow-100 text-yellow-800',
  money: 'bg-orange-100 text-orange-800'
};

export default function DraftReview() {
  const [, params] = useRoute('/project/:projectId/draft/:runId');
  const { projectId, runId } = params || {};
  
  const [selectedScenario, setSelectedScenario] = useState<string>('all');
  const [selectedPage, setSelectedPage] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  // Fetch draft data
  const { data: draftData, isLoading, error } = useQuery<DraftData>({
    queryKey: ['/api/draft', runId, selectedScenario, selectedPage, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        scenario: selectedScenario,
        page: selectedPage,
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      const response = await fetch(`/api/draft/${runId}?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch draft data');
      }
      
      return response.json();
    },
    enabled: !!runId
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Загрузка результатов генерации...</p>
        </div>
      </div>
    );
  }

  if (error || !draftData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-red-600 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">Ошибка загрузки</h2>
          <p className="text-gray-600">Не удалось загрузить результаты генерации</p>
          <Link href={`/project/${projectId}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Вернуться к проекту
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(draftData.total / pageSize);
  const acceptedTotal = draftData.stats.reduce((sum, stat) => sum + stat.accepted, 0);
  const rejectedTotal = draftData.stats.reduce((sum, stat) => sum + stat.rejected, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
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
                Просмотр черновика
              </h1>
            </div>
            <p className="text-gray-600">
              Проверьте сгенерированные ссылки перед публикацией
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline">
              Экспорт CSV
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Опубликовать черновик
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Всего</p>
                  <p className="text-2xl font-bold text-gray-900">{draftData.total}</p>
                </div>
                <Filter className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Принято</p>
                  <p className="text-2xl font-bold text-green-600">{acceptedTotal}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Отклонено</p>
                  <p className="text-2xl font-bold text-red-600">{rejectedTotal}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Качество</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {Math.round((acceptedTotal / draftData.total) * 100)}%
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scenario Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Статистика по сценариям</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {draftData.stats.map((stat) => (
                <div key={stat.scenario} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={SCENARIO_COLORS[stat.scenario] || 'bg-gray-100 text-gray-800'}>
                      {SCENARIO_LABELS[stat.scenario] || stat.scenario}
                    </Badge>
                    <span className="text-sm text-gray-500">{stat.total}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Принято: {stat.accepted}</span>
                      <span className="text-red-600">Отклонено: {stat.rejected}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(stat.accepted / stat.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Сценарий:</label>
                <Select value={selectedScenario} onValueChange={setSelectedScenario}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все сценарии</SelectItem>
                    {Object.entries(SCENARIO_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Страница:</label>
                <Select value={selectedPage} onValueChange={setSelectedPage}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все страницы</SelectItem>
                    {/* TODO: Add unique pages from data */}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Link Candidates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Кандидаты ссылок</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Статус</TableHead>
                  <TableHead>Сценарий</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Цель</TableHead>
                  <TableHead>Анкор</TableHead>
                  <TableHead>Причина отклонения</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftData.candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      {candidate.isRejected ? (
                        <Badge variant="destructive">Отклонено</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-100 text-green-800">Принято</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={SCENARIO_COLORS[candidate.scenario] || 'bg-gray-100 text-gray-800'}>
                        {SCENARIO_LABELS[candidate.scenario] || candidate.scenario}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">
                        <a 
                          href={candidate.sourceUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          {candidate.sourceUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">
                        <a 
                          href={candidate.targetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          {candidate.targetUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{candidate.anchorText}</span>
                    </TableCell>
                    <TableCell>
                      {candidate.rejectionReason && (
                        <span className="text-sm text-red-600">
                          {candidate.rejectionReason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-700">
                  Показано {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, draftData.total)} из {draftData.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                  >
                    Назад
                  </Button>
                  <span className="text-sm text-gray-700">
                    Страница {currentPage + 1} из {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage === totalPages - 1}
                  >
                    Вперед
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}