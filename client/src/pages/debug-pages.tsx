import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

interface PageData {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  hasLinks: boolean;
  isOrphan: boolean;
  linkCount: number;
  contentPreview: string;
}

export default function DebugPages() {
  const { user } = useAuth();

  // Получить список страниц из последнего импорта
  const { data: pagesData, isLoading } = useQuery({
    queryKey: ['/api/debug/pages'],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад к дашборду
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Отладка страниц</h1>
        </div>
        <div className="text-center py-8">Загрузка данных страниц...</div>
      </div>
    );
  }

  const pages: PageData[] = pagesData?.pages || [];
  const stats = pagesData?.stats || {};

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к дашборду
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Отладка страниц - Статистика по импорту</h1>
      </div>

      {/* Общая статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Всего страниц</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPages || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Страницы-сироты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.orphanCount || 0}</div>
            <div className="text-xs text-muted-foreground">
              {stats.totalPages > 0 ? Math.round((stats.orphanCount / stats.totalPages) * 100) : 0}% от общего
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Связанные страницы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.linkedPages || 0}</div>
            <div className="text-xs text-muted-foreground">
              {stats.totalPages > 0 ? Math.round((stats.linkedPages / stats.totalPages) * 100) : 0}% от общего
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Среднее слов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgWordCount || 0}</div>
            <div className="text-xs text-muted-foreground">слов на страницу</div>
          </CardContent>
        </Card>
      </div>

      {/* Таблица страниц */}
      <Card>
        <CardHeader>
          <CardTitle>Детальная информация по страницам</CardTitle>
          <p className="text-sm text-muted-foreground">
            Показаны первые 50 страниц из импорта. 
            Красным отмечены страницы-сироты (без внутренних ссылок).
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[300px]">URL / Заголовок</TableHead>
                  <TableHead className="w-20">Слова</TableHead>
                  <TableHead className="w-20">Ссылки</TableHead>
                  <TableHead className="w-24">Статус</TableHead>
                  <TableHead className="min-w-[200px]">Превью контента</TableHead>
                  <TableHead className="w-16">Открыть</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.slice(0, 50).map((page, index) => (
                  <TableRow key={index} className={page.isOrphan ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-mono text-sm">{index + 1}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate" title={page.title}>
                          {page.title || "Без заголовка"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate" title={page.url}>
                          {page.url}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {page.wordCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" />
                        <span className="text-sm">{page.linkCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={page.isOrphan ? "destructive" : "default"}
                        className="text-xs"
                      >
                        {page.isOrphan ? "Сирота" : "Связана"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div 
                        className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]"
                        title={page.contentPreview}
                      >
                        {page.contentPreview}
                      </div>
                    </TableCell>
                    <TableCell>
                      {page.url && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(page.url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {pages.length > 50 && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Показаны первые 50 из {pages.length} страниц
            </div>
          )}
          
          {pages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Нет данных для отображения. Запустите импорт CSV файла.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}