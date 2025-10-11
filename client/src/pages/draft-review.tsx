import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, Edit2, X, Check, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";

interface DraftLink {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  sourceTitle: string;
  targetTitle: string;
  anchorText: string;
  scenario: string;
  originalSentence: string | null;
  modifiedSentence: string | null;
  isRejected: boolean;
  rejectionReason: string | null;
}

const SCENARIO_LABELS: Record<string, string> = {
  'orphan_fix': 'Поднятие сирот',
  'head_consolidation': 'Консолидация голов',
  'cluster_crosslink': 'Кросс-линковка',
  'commercial_routing': 'Коммерческий роутинг',
  'depth_lift': 'Поднятие глубоких',
  'freshness_push': 'Продвижение свежих'
};

export default function DraftReview() {
  const [, params] = useRoute('/project/:projectId/draft/:runId');
  const { projectId } = params || {};
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fetch draft links
  const { data, isLoading, error } = useQuery<{ links: DraftLink[] }>({
    queryKey: [`/api/projects/${projectId}/draft-links`],
    enabled: !!projectId
  });

  // Update link mutation
  const updateMutation = useMutation({
    mutationFn: async ({ linkId, modifiedSentence }: { linkId: string; modifiedSentence: string }) => {
      return apiRequest("PATCH", `/api/draft-links/${linkId}`, { modifiedSentence });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/draft-links`] });
      toast({
        title: "Сохранено",
        description: "Предложение успешно обновлено",
      });
      setEditingId(null);
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить предложение",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (link: DraftLink) => {
    setEditingId(link.id);
    setEditValue(link.modifiedSentence || link.originalSentence || "");
  };

  const handleSave = (linkId: string) => {
    updateMutation.mutate({ linkId, modifiedSentence: editValue });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const exportToCSV = () => {
    if (!data?.links) return;

    const acceptedLinks = data.links.filter(l => !l.isRejected);
    
    const headers = [
      "Статья (источник)",
      "Статья (цель)",
      "Анкор",
      "Старое предложение",
      "Новое предложение со ссылкой",
      "Сценарий"
    ];

    const rows = acceptedLinks.map(link => [
      link.sourceTitle,
      link.targetTitle,
      link.anchorText,
      link.originalSentence || "",
      link.modifiedSentence || link.originalSentence || "",
      SCENARIO_LABELS[link.scenario] || link.scenario
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `draft-links-${projectId}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Экспорт завершен",
      description: `Экспортировано ${acceptedLinks.length} ссылок`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка черновика...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Ошибка загрузки черновика</h2>
            <p className="text-red-600">{error instanceof Error ? error.message : 'Не удалось загрузить черновик'}</p>
          </div>
          <Link href={`/project/${projectId}`}>
            <Button>Вернуться к проекту</Button>
          </Link>
        </div>
      </div>
    );
  }

  const acceptedLinks = data?.links?.filter(l => !l.isRejected) || [];
  const rejectedLinks = data?.links?.filter(l => l.isRejected) || [];

  // Show empty state if no links
  if (data?.links && data.links.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto py-8 px-4">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/project/${projectId}`}>
              <Button variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад к проекту
              </Button>
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8">
                <h2 className="text-2xl font-semibold text-blue-900 mb-3">Черновик пуст</h2>
                <p className="text-blue-700 mb-4">
                  Нет сгенерированных ссылок для проверки. Возможно, генерация ещё не завершена или все ссылки были отклонены.
                </p>
                <Link href={`/project/${projectId}`}>
                  <Button>Вернуться к проекту</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href={`/project/${projectId}`}>
              <Button variant="outline" size="sm" data-testid="button-back">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-draft-review">
                Проверка черновика
              </h1>
              <p className="text-muted-foreground mt-2">
                Принято: {acceptedLinks.length} | Отклонено: {rejectedLinks.length}
              </p>
            </div>
          </div>
          <Button
            onClick={exportToCSV}
            disabled={acceptedLinks.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="mr-2 h-4 w-4" />
            Экспорт в CSV
          </Button>
        </div>

        <Card className="p-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Статья</TableHead>
                  <TableHead className="w-[200px]">Цель</TableHead>
                  <TableHead className="w-[120px]">Анкор</TableHead>
                  <TableHead className="w-[250px]">Старое предложение</TableHead>
                  <TableHead className="w-[250px]">Новое предложение</TableHead>
                  <TableHead className="w-[100px]">Сценарий</TableHead>
                  <TableHead className="w-[100px] text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptedLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Нет принятых ссылок для отображения
                    </TableCell>
                  </TableRow>
                ) : (
                  acceptedLinks.map((link) => (
                    <TableRow key={link.id} data-testid={`row-link-${link.id}`}>
                      <TableCell className="font-medium truncate" title={link.sourceTitle}>
                        {link.sourceTitle}
                      </TableCell>
                      <TableCell className="truncate" title={link.targetTitle}>
                        {link.targetTitle}
                      </TableCell>
                      <TableCell className="font-medium text-primary">
                        {link.anchorText}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {link.originalSentence || "—"}
                      </TableCell>
                      <TableCell>
                        {editingId === link.id ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full"
                            data-testid={`input-edit-sentence-${link.id}`}
                          />
                        ) : (
                          <span className="text-sm">
                            {link.modifiedSentence || link.originalSentence || "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-1 bg-secondary rounded-full">
                          {SCENARIO_LABELS[link.scenario] || link.scenario}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === link.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              onClick={() => handleSave(link.id)}
                              disabled={updateMutation.isPending}
                              data-testid={`button-save-${link.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancel}
                              data-testid={`button-cancel-${link.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(link)}
                            data-testid={`button-edit-${link.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {rejectedLinks.length > 0 && (
          <Card className="mt-6 p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Отклоненные ссылки ({rejectedLinks.length})</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="space-y-2">
                {rejectedLinks.map((link) => (
                  <div key={link.id} className="p-3 bg-muted rounded-lg text-sm">
                    <div className="font-medium">{link.sourceTitle} → {link.targetTitle}</div>
                    <div className="text-muted-foreground mt-1">
                      Причина: {link.rejectionReason}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
