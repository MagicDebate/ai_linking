import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, Link } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface ResultsProps {
  projectId: string;
}

interface GenerationReport {
  hasResults: boolean;
  message?: string;
  generatedAt?: string;
  duration?: number;
  metrics?: {
    orphansFixed: { before: number; after: number };
    avgDepth: { before: number; after: number };
    linksAdded: number;
    duplicatesRemoved: number;
    broken404Fixed: { before: number; after: number };
  };
  processingStats?: {
    totalPages: number;
    processedPages: number;
    processedPercentage: number;
  };
  anchorProfile?: {
    before: { exact: number; partial: number; brand: number; generic: number };
    after: { exact: number; partial: number; brand: number; generic: number };
  };
  topDonors?: Array<{
    url: string;
    newOutgoing: number;
    totalOutgoing: number;
    trafficTrend: number;
  }>;
  linkJuice?: {
    sources: string[];
    targets: string[];
    flows: Array<{ source: number; target: number; value: number }>;
  };
  linkDetails?: Array<{
    sourceUrl: string;
    targetUrl: string;
    anchorText: string;
    scenario: string;
  }>;
  generationStats?: {
    total: number;
    accepted: number;
    rejected: number;
  };
}

export function Results({ projectId }: ResultsProps) {
  const { data: report, isLoading } = useQuery<GenerationReport>({
    queryKey: ['/api/projects', projectId, 'results'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Результаты генерации
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Загрузка результатов...</p>
        </CardContent>
      </Card>
    );
  }

  if (!report?.hasResults) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Результаты генерации
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {report?.message || "Запустите генерацию для получения результатов"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { metrics, anchorProfile, topDonors } = report;

  const getChangeIcon = (before: number, after: number, isGood: 'higher' | 'lower') => {
    if (before === after) return <Minus className="w-4 h-4 text-gray-400" />;
    const isImproved = isGood === 'lower' ? after < before : after > before;
    return isImproved ? 
      <ArrowUp className="w-4 h-4 text-green-600" /> : 
      <ArrowDown className="w-4 h-4 text-red-600" />;
  };

  const getChangeColor = (before: number, after: number, isGood: 'higher' | 'lower') => {
    if (before === after) return 'bg-gray-50 border-gray-200';
    const isImproved = isGood === 'lower' ? after < before : after > before;
    return isImproved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  };

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Результаты генерации
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Выполнено: {new Date(report.generatedAt!).toLocaleString('ru-RU')}
            {report.duration && ` • Время: ${report.duration}с`}
            {report.processingStats && (
              ` • Обработано ${report.processingStats.processedPages} из ${report.processingStats.totalPages} страниц (${report.processingStats.processedPercentage}%)`
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Orphans Fixed */}
            <div className={`p-4 rounded-lg border ${getChangeColor(metrics!.orphansFixed.before, metrics!.orphansFixed.after, 'lower')}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Сироты</span>
                {getChangeIcon(metrics!.orphansFixed.before, metrics!.orphansFixed.after, 'lower')}
              </div>
              <div className="text-2xl font-bold">
                {metrics!.orphansFixed.before} → {metrics!.orphansFixed.after}
              </div>
              <p className="text-xs text-muted-foreground">Страницы без входящих ссылок</p>
            </div>

            {/* Average Depth */}
            <div className={`p-4 rounded-lg border ${getChangeColor(metrics!.avgDepth.before, metrics!.avgDepth.after, 'lower')}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Средняя глубина</span>
                {getChangeIcon(metrics!.avgDepth.before, metrics!.avgDepth.after, 'lower')}
              </div>
              <div className="text-2xl font-bold">
                {metrics!.avgDepth.before} → {metrics!.avgDepth.after}
              </div>
              <p className="text-xs text-muted-foreground">Среднее число кликов до URL</p>
            </div>

            {/* Links Added */}
            <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Добавлено ссылок</span>
                <ArrowUp className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-600">
                +{metrics!.linksAdded}
              </div>
              <p className="text-xs text-muted-foreground">Новые контекстные ссылки</p>
            </div>

            {/* Duplicates Removed */}
            <div className="p-4 rounded-lg border bg-green-50 border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Удалено дублей</span>
                <ArrowUp className="w-4 h-4 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                {metrics!.duplicatesRemoved}
              </div>
              <p className="text-xs text-muted-foreground">Повторные ссылки на один URL</p>
            </div>

            {/* 404 Fixed */}
            <div className={`p-4 rounded-lg border ${getChangeColor(metrics!.broken404Fixed.before, metrics!.broken404Fixed.after, 'lower')}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Удалено 404</span>
                {getChangeIcon(metrics!.broken404Fixed.before, metrics!.broken404Fixed.after, 'lower')}
              </div>
              <div className="text-2xl font-bold">
                {metrics!.broken404Fixed.before} → {metrics!.broken404Fixed.after}
              </div>
              <p className="text-xs text-muted-foreground">Битые ссылки очищены</p>
            </div>
          </div>

          {/* Anchor Profile */}
          {anchorProfile && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">Anchor Profile</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">До генерации</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Exact</span>
                      <Badge variant={anchorProfile.before.exact > 40 ? "destructive" : "secondary"}>
                        {anchorProfile.before.exact}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Partial</span>
                      <Badge variant="secondary">{anchorProfile.before.partial}%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Brand</span>
                      <Badge variant="secondary">{anchorProfile.before.brand}%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Generic</span>
                      <Badge variant="secondary">{anchorProfile.before.generic}%</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">После генерации</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Exact</span>
                      <Badge variant={anchorProfile.after.exact <= 30 ? "default" : "secondary"} 
                             className={anchorProfile.after.exact <= 30 ? "bg-green-600" : ""}>
                        {anchorProfile.after.exact}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Partial</span>
                      <Badge variant="secondary">{anchorProfile.after.partial}%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Brand</span>
                      <Badge variant="secondary">{anchorProfile.after.brand}%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Generic</span>
                      <Badge variant="secondary">{anchorProfile.after.generic}%</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Donor Pages */}
          {topDonors && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Топ-5 страниц-доноров</h3>
              <div className="space-y-2">
                {topDonors.map((donor, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{donor.url}</p>
                      <p className="text-xs text-muted-foreground">
                        +{donor.newOutgoing} новых из {donor.totalOutgoing} всего
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {donor.trafficTrend > 0 ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-sm">+{donor.trafficTrend}%</span>
                        </div>
                      ) : donor.trafficTrend < 0 ? (
                        <div className="flex items-center gap-1 text-red-600">
                          <TrendingDown className="w-4 h-4" />
                          <span className="text-sm">{donor.trafficTrend}%</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <Minus className="w-4 h-4" />
                          <span className="text-sm">0%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Link Insertions Report */}
      {report.linkDetails && report.linkDetails.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Link className="h-5 w-5 mr-2 text-blue-600" />
              Детальный отчет по вставленным ссылкам
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {report.linkDetails.map((link: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Страница-донор:</p>
                      <p className="text-sm text-blue-600 break-all">{link.sourceUrl}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Целевая страница:</p>
                      <p className="text-sm text-green-600 break-all">{link.targetUrl}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-600">Анкор ссылки:</p>
                    <p className="text-sm font-semibold text-gray-900">"{link.anchorText}"</p>
                  </div>
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {link.scenario === 'orphan' ? 'Фикс сирот' : link.scenario}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Показано {report.linkDetails.length} из {report.generationStats?.accepted || 0} принятых ссылок
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}