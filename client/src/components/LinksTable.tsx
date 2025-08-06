import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Search, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Link {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  scenario: string;
  similarity: number;
  isRejected: boolean;
  createdAt: string;
}

interface LinksTableProps {
  projectId: string;
}

// Функция для транслитерации анкоров обратно в кириллицу
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
    'vidy depressii': 'виды депрессии'
  };
  
  const lowerAnchor = anchor.toLowerCase();
  
  // Проверяем точные совпадения
  if (fixedPhrases[lowerAnchor]) {
    return fixedPhrases[lowerAnchor];
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

function getShortUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] || urlObj.hostname;
  } catch {
    return url;
  }
}

export function LinksTable({ projectId }: LinksTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterScenario, setFilterScenario] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: linksData, isLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'links'],
    enabled: !!projectId
  });

  if (isLoading) {
    return (
      <Button disabled>
        <Search className="mr-2 h-4 w-4" />
        Загрузка ссылок...
      </Button>
    );
  }

  const links: Link[] = (linksData as any)?.links || [];
  const runInfo = (linksData as any)?.runInfo;

  // Фильтрация ссылок
  const filteredLinks = links.filter(link => {
    const matchesSearch = 
      link.sourceUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
      link.targetUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
      convertAnchorToCyrillic(link.anchorText).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesScenario = filterScenario === "all" || link.scenario === filterScenario;
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "accepted" && !link.isRejected) ||
      (filterStatus === "rejected" && link.isRejected);

    return matchesSearch && matchesScenario && matchesStatus;
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="ml-2">
          <ExternalLink className="mr-2 h-4 w-4" />
          Все ссылки ({links.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Сгенерированные ссылки</span>
            {runInfo && (
              <Badge variant="outline">
                {runInfo.generated} создано, {runInfo.rejected} отклонено
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {/* Фильтры */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Поиск по URL или анкору..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={filterScenario} onValueChange={setFilterScenario}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Сценарий" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сценарии</SelectItem>
              <SelectItem value="orphan">Сироты</SelectItem>
              <SelectItem value="hub">Хабы</SelectItem>
              <SelectItem value="deep">Глубокие</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="accepted">Принятые</SelectItem>
              <SelectItem value="rejected">Отклоненные</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Таблица */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Страница-донор</TableHead>
                <TableHead className="w-[300px]">Целевая страница</TableHead>
                <TableHead className="w-[250px]">Анкор ссылки</TableHead>
                <TableHead className="w-[100px]">Сценарий</TableHead>
                <TableHead className="w-[100px]">Релевантность</TableHead>
                <TableHead className="w-[100px]">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {searchTerm || filterScenario !== "all" || filterStatus !== "all" 
                      ? "Ссылки не найдены по заданным фильтрам"
                      : "Ссылки не найдены"
                    }
                  </TableCell>
                </TableRow>
              ) : (
                filteredLinks.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <a 
                        href={link.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline text-sm"
                        title={link.sourceUrl}
                      >
                        {getShortUrl(link.sourceUrl)}
                      </a>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={link.targetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline text-sm"
                        title={link.targetUrl}
                      >
                        {getShortUrl(link.targetUrl)}
                      </a>
                    </TableCell>
                    <TableCell className="font-medium">
                      {convertAnchorToCyrillic(link.anchorText)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{link.scenario}</Badge>
                    </TableCell>
                    <TableCell>
                      {link.similarity ? `${Math.round(link.similarity * 100)}%` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={link.isRejected ? "destructive" : "default"}>
                        {link.isRejected ? 'Отклонена' : 'Принята'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filteredLinks.length > 0 && (
          <div className="text-sm text-muted-foreground mt-4">
            Показано {filteredLinks.length} из {links.length} ссылок
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}