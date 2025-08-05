import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Filter, ExternalLink } from "lucide-react";
import { Link, useParams } from "wouter";

interface PageData {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  urlDepth: number;
  internalLinkCount: number;
  isOrphan: boolean;
  contentPreview: string;
}

interface StatsData {
  totalPages: number;
  orphanCount: number;
  linkedPages: number;
  avgWordCount: number;
}

export default function DebugPages() {
  const { user } = useAuth();
  const params = useParams();
  const projectId = params.projectId;
  
  // Filter states
  const [filters, setFilters] = useState({
    minWords: '',
    maxWords: '',
    urlDepth: 'all',
    minLinks: '',
    maxLinks: '',
    orphanOnly: false
  });

  // Get pages data for the project
  const { data: pagesData, isLoading } = useQuery<{pages: PageData[], stats: StatsData}>({
    queryKey: [`/api/debug/pages/${projectId}`],
    enabled: !!user && !!projectId,
  });

  // Filter pages based on filters
  const filteredPages = pagesData?.pages?.filter((page: PageData) => {
    if (filters.minWords && page.wordCount < parseInt(filters.minWords)) return false;
    if (filters.maxWords && page.wordCount > parseInt(filters.maxWords)) return false;
    if (filters.urlDepth && filters.urlDepth !== 'all' && page.urlDepth !== parseInt(filters.urlDepth)) return false;
    if (filters.minLinks && page.internalLinkCount < parseInt(filters.minLinks)) return false;
    if (filters.maxLinks && page.internalLinkCount > parseInt(filters.maxLinks)) return false;
    if (filters.orphanOnly && !page.isOrphan) return false;
    return true;
  }) || [];

  const clearFilters = () => {
    setFilters({
      minWords: '',
      maxWords: '',
      urlDepth: 'all',
      minLinks: '',
      maxLinks: '',
      orphanOnly: false
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/project/${projectId}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              К проекту
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Отладка страниц</h1>
        </div>
        <div className="text-center py-8">Загрузка данных страниц...</div>
      </div>
    );
  }

  if (!pagesData || !pagesData.pages) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/project/${projectId}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              К проекту
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Отладка страниц</h1>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-600">Нет данных для отображения</p>
          <p className="text-sm text-gray-500 mt-2">Сначала загрузите CSV файл в проект</p>
        </div>
      </div>
    );
  }

  const stats = pagesData.stats;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/project/${projectId}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            К проекту
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Отладка страниц - Статистика по импорту</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Всего страниц</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPages}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Страницы-сироты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.orphanCount}</div>
            <div className="text-xs text-gray-500">
              {stats.totalPages > 0 ? Math.round((stats.orphanCount / stats.totalPages) * 100) : 0}% от общего
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Связанные страницы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.linkedPages}</div>
            <div className="text-xs text-gray-500">
              {stats.totalPages > 0 ? Math.round((stats.linkedPages / stats.totalPages) * 100) : 0}% от общего
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Среднее слов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgWordCount}</div>
            <div className="text-xs text-gray-500">слов на страницу</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Фильтры
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label htmlFor="minWords">Мин. слов</Label>
              <Input
                id="minWords"
                type="number"
                placeholder="0"
                value={filters.minWords}
                onChange={(e) => setFilters(prev => ({...prev, minWords: e.target.value}))}
              />
            </div>
            
            <div>
              <Label htmlFor="maxWords">Макс. слов</Label>
              <Input
                id="maxWords"
                type="number"
                placeholder="∞"
                value={filters.maxWords}
                onChange={(e) => setFilters(prev => ({...prev, maxWords: e.target.value}))}
              />
            </div>
            
            <div>
              <Label htmlFor="urlDepth">Глубина URL</Label>
              <Select value={filters.urlDepth} onValueChange={(value) => setFilters(prev => ({...prev, urlDepth: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Любая" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Любая</SelectItem>
                  <SelectItem value="0">0 (главная)</SelectItem>
                  <SelectItem value="1">1 (/page)</SelectItem>
                  <SelectItem value="2">2 (/cat/page)</SelectItem>
                  <SelectItem value="3">3+ (глубокие)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="minLinks">Мин. ссылок</Label>
              <Input
                id="minLinks"
                type="number"
                placeholder="0"
                value={filters.minLinks}
                onChange={(e) => setFilters(prev => ({...prev, minLinks: e.target.value}))}
              />
            </div>
            
            <div>
              <Label htmlFor="maxLinks">Макс. ссылок</Label>
              <Input
                id="maxLinks"
                type="number"
                placeholder="∞"
                value={filters.maxLinks}
                onChange={(e) => setFilters(prev => ({...prev, maxLinks: e.target.value}))}
              />
            </div>
            
            <div className="flex flex-col justify-end">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="orphanOnly"
                  checked={filters.orphanOnly}
                  onCheckedChange={(checked) => setFilters(prev => ({...prev, orphanOnly: !!checked}))}
                />
                <Label htmlFor="orphanOnly">Только сироты</Label>
              </div>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Сбросить
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pages Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Детальная информация по страницам
            <span className="ml-2 text-sm font-normal text-gray-500">
              Показано первые 50 страниц из категории. Красным отмечены страницы-сироты (без внутренних ссылок).
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600 mb-4">
            Найдено страниц: {filteredPages.length} из {stats.totalPages}
          </div>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>URL / Заголовок</TableHead>
                  <TableHead className="text-center">Слова</TableHead>
                  <TableHead className="text-center">Глубина</TableHead>
                  <TableHead className="text-center">Ссылки</TableHead>
                  <TableHead className="text-center">Статус</TableHead>
                  <TableHead>Превью контента</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPages.slice(0, 50).map((page, index) => (
                  <TableRow key={index} className={page.isOrphan ? "bg-red-50" : ""}>
                    <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate max-w-xs">{page.title}</span>
                          <a 
                            href={page.url.startsWith('http') ? page.url : `https://evolucionika.ru${page.url}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        </div>
                        <a 
                          href={page.url.startsWith('http') ? page.url : `https://evolucionika.ru${page.url}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 font-mono truncate max-w-xs block"
                        >
                          {page.url.startsWith('http') ? page.url : `https://evolucionika.ru${page.url}`}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">
                        {page.wordCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">
                        {page.urlDepth}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${page.internalLinkCount === 0 ? 'border-red-300 text-red-600' : 'border-green-300 text-green-600'}`}
                      >
                        {page.internalLinkCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={page.isOrphan ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {page.isOrphan ? "Сирота" : "Связанная"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-gray-600 max-w-xs truncate">
                        {page.contentPreview}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {filteredPages.length > 50 && (
            <div className="mt-4 text-center text-sm text-gray-500">
              Показаны первые 50 из {filteredPages.length} найденных страниц
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}