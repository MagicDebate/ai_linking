import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ExternalLink, 
  ArrowRight,
  Download,
  Eye,
  EyeOff
} from "lucide-react";

interface LinkCandidate {
  id: string;
  sourcePageId: string;
  targetPageId: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  score: number;
  scenario: string;
  status: 'accepted' | 'rejected' | 'pending';
  createdAt: string;
}

interface LinkResultsProps {
  runId: string;
  projectId: string;
  onNext?: () => void;
}

export default function LinkResults({ runId, projectId, onNext }: LinkResultsProps) {
  const [selectedTab, setSelectedTab] = useState("candidates");
  const [showGraph, setShowGraph] = useState(false);

  // Fetch generation results
  const { data: results, isLoading: resultsLoading, refetch: refetchResults } = useQuery({
    queryKey: ['generation-results', runId],
    queryFn: async () => {
      console.log(`🔍 [LinkResults] Fetching results for runId: ${runId}`);
      const response = await fetch(`/api/generate/results/${runId}`);
      console.log(`🔍 [LinkResults] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [LinkResults] API error: ${response.status} - ${errorText}`);
        return null;
      }
      
      const data = await response.json();
      console.log(`🔍 [LinkResults] Response data:`, data);
      return data;
    },
    enabled: !!runId,
    refetchInterval: 5000
  });

  // Fetch graph data
  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ['graph-data', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/graph`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!projectId && showGraph
  });

  // Update candidate status
  const updateCandidateStatus = async (candidateId: string, status: 'accepted' | 'rejected' | 'pending') => {
    try {
      const response = await fetch(`/api/generate/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (response.ok) {
        refetchResults();
      }
    } catch (error) {
      console.error('Error updating candidate:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Принято</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Отклонено</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Ожидает</Badge>;
    }
  };

  const getScenarioBadge = (scenario: string) => {
    const colors = {
      'orphan_fix': 'bg-blue-500',
      'head_consolidation': 'bg-purple-500',
      'cluster_cross_link': 'bg-orange-500',
      'commercial_routing': 'bg-green-500',
      'depth_lift': 'bg-red-500',
      'freshness_push': 'bg-yellow-500'
    };
    
    return (
      <Badge variant="outline" className={colors[scenario as keyof typeof colors] || 'bg-gray-500'}>
        {scenario.replace('_', ' ')}
      </Badge>
    );
  };

  if (resultsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Загрузка результатов...</div>
        </CardContent>
      </Card>
    );
  }

  console.log(`🔍 [LinkResults] Render state:`, {
    runId,
    projectId,
    results,
    resultsLoading,
    hasResults: !!results,
    hasCandidates: !!results?.candidates?.length,
    candidatesCount: results?.candidates?.length || 0
  });

  if (!results || !results.candidates?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Результаты генерации</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p>Результаты генерации не найдены.</p>
            <div className="text-sm text-gray-500">
              <p>RunId: {runId}</p>
              <p>ProjectId: {projectId}</p>
              <p>Results: {results ? 'Есть' : 'Нет'}</p>
              <p>Candidates: {results?.candidates?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const candidates = results.candidates as LinkCandidate[];
  const acceptedCount = candidates.filter(c => c.status === 'accepted').length;
  const rejectedCount = candidates.filter(c => c.status === 'rejected').length;
  const pendingCount = candidates.filter(c => c.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{candidates.length}</div>
            <div className="text-sm text-muted-foreground">Всего кандидатов</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{acceptedCount}</div>
            <div className="text-sm text-muted-foreground">Принято</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            <div className="text-sm text-muted-foreground">Отклонено</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <div className="text-sm text-muted-foreground">Ожидает</div>
          </CardContent>
        </Card>
      </div>

      {/* Download button */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Управление ссылками</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowGraph(!showGraph)}
          >
            {showGraph ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showGraph ? 'Скрыть граф' : 'Показать граф'}
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Скачать результаты
          </Button>
          {onNext && (
            <Button onClick={onNext}>
              Перейти к публикации
            </Button>
          )}
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="candidates">Кандидаты ссылок</TabsTrigger>
          <TabsTrigger value="graph">Граф связей</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-4">
          <div className="max-h-96 overflow-y-auto space-y-4">
            {candidates.map((candidate) => (
              <Card key={candidate.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-2">
                      {getStatusBadge(candidate.status)}
                      {getScenarioBadge(candidate.scenario)}
                      <Badge variant="outline">Score: {candidate.score.toFixed(2)}</Badge>
                    </div>
                    <div className="flex gap-2">
                      {candidate.status !== 'accepted' && (
                        <Button
                          size="sm"
                          onClick={() => updateCandidateStatus(candidate.id, 'accepted')}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Принять
                        </Button>
                      )}
                      {candidate.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateCandidateStatus(candidate.id, 'rejected')}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Отклонить
                        </Button>
                      )}
                      {candidate.status !== 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateCandidateStatus(candidate.id, 'pending')}
                        >
                          <Clock className="w-4 h-4 mr-1" />
                          В ожидание
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Источник:</span>
                      <a 
                        href={candidate.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {candidate.sourceUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium">Анкор:</span>
                      <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                        "{candidate.anchorText}"
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Цель:</span>
                      <a 
                        href={candidate.targetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {candidate.targetUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="graph">
          {showGraph ? (
            <Card>
              <CardHeader>
                <CardTitle>Граф связей</CardTitle>
              </CardHeader>
              <CardContent>
                {graphLoading ? (
                  <div className="text-center py-8">Загрузка графа...</div>
                ) : graphData ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Страниц: {graphData.pages.length} | Ссылок: {graphData.links.length}
                    </div>
                    <div className="h-96 border rounded-lg bg-gray-50 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-gray-600">Визуализация графа</div>
                        <p className="text-sm text-gray-500">Здесь будет интерактивный граф связей</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Ошибка загрузки данных графа
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-600">Нажмите "Показать граф" для визуализации связей</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
