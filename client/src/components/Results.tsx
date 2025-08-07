import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, Link } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { LinksTable } from '@/components/LinksTable';

// Функция для конвертации транслитерированных анкоров в кириллицу
function convertAnchorToCyrillic(anchor: string): string {
  // Сначала проверяем готовые фразы
  const fixedPhrases: { [key: string]: string } = {
    'kak ponyat chto u tebya panicheskaya ataka': 'как понять что у тебя паническая атака',
    'chto takoe osoznannost ot buddijskoj': 'что такое осознанность от буддийской',
    'chto delat pri panicheskoy atake': 'что делать при панической атаке',
    'lechenie panicheskih atak': 'лечение панических атак',
    'panicheskie ataki posle alkogolya': 'панические атаки после алкоголя',
    'panicheskie ataki pered snom pri zasypanii': 'панические атаки перед сном при засыпании',
    'panicheskiy strah': 'панический страх',
    'plohoe samochuvstvie posle panicheskoy ataki': 'плохое самочувствие после панической атаки',
    'simptomy panicheskih atak u zhenshchin': 'симптомы панических атак у женщин',
    'panicheskie ataki pri klimakse': 'панические атаки при климаксе',
    'bessonnica pri depressii': 'бессонница при депрессии',
    'hronicheskaya depressiya': 'хроническая депрессия',
    'vidy depressii': 'виды депрессии',
    'kak spravitsya s depressiey': 'как справиться с депрессией',
    'metody lecheniya': 'методы лечения',
    'vozmozhnyye sposoby lecheniya': 'возможные способы лечения'
  };
  
  const lowerAnchor = anchor.toLowerCase();
  
  // Проверяем точные совпадения
  if (fixedPhrases[lowerAnchor]) {
    return fixedPhrases[lowerAnchor];
  }
  
  // Если уже кириллица, возвращаем как есть
  if (/[а-яё]/i.test(anchor)) {
    return anchor;
  }
  
  // Общая транслитерация для остальных случаев
  const translitMap: { [key: string]: string } = {
    'shch': 'щ', 'sch': 'щ', 'sh': 'ш', 'ch': 'ч', 'zh': 'ж', 'yu': 'ю', 'ya': 'я', 'yo': 'ё',
    'kh': 'х', 'ts': 'ц', 'tz': 'ц', 'ph': 'ф', 'th': 'т', 'iy': 'ий', 'yy': 'ый', 'oy': 'ой',
    'ey': 'ей', 'ay': 'ай', 'uy': 'уй', 'yj': 'ый', 'ij': 'ий', 'yh': 'ых', 'ih': 'их',
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'z': 'з', 'i': 'и', 
    'j': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р',
    's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'w': 'в', 'x': 'кс',
    'y': 'ы', 'q': 'к'
  };
  
  let result = lowerAnchor;
  const sortedKeys = Object.keys(translitMap).sort((a, b) => b.length - a.length);
  
  for (const latin of sortedKeys) {
    result = result.replace(new RegExp(latin, 'g'), translitMap[latin]);
  }
  
  // Постобработка для исправления частых ошибок
  result = result.replace(/понят([^ь])/g, 'понять$1');
  result = result.replace(/осознанност([^ь])/g, 'осознанность$1');
  result = result.replace(/атак([^аи])/g, 'атака$1');
  result = result.replace(/депресси([^яюи])/g, 'депрессия$1');
  
  return result;
}

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

  const { metrics } = report;

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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Link className="w-5 h-5" />
              Результаты генерации
            </CardTitle>
            <LinksTable projectId={projectId} />
          </div>
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


        </CardContent>
      </Card>


    </div>
  );
}