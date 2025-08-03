import { useState, useRef, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Globe,
  CheckCircle2,
  ArrowRight,
  Download,
  AlertCircle,
  ArrowLeft,
  Settings,
  Link as LinkIcon,
  Info,
  X,
  Calendar,
  TrendingUp,
  Play
} from "lucide-react";

interface FieldMapping {
  [key: string]: string;
}

interface CsvPreview {
  headers: string[];
  rows: string[][];
}

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "QUEUED" | "READY";
  updatedAt: string;
}

interface LinkingRules {
  maxLinks: number;
  minDistance: number;
  exactPercent: number;
  scenarios: {
    headConsolidation: boolean;
    clusterCrossLink: boolean;
    commercialRouting: boolean;
    orphanFix: boolean;
    depthLift: boolean;
  };
  depthThreshold: number;
  oldLinksPolicy: 'enrich' | 'regenerate' | 'audit';
  dedupeLinks: boolean;
  brokenLinksPolicy: 'delete' | 'replace' | 'ignore';
  stopAnchors: string[];
  moneyPages: string[];
  freshnessPush: boolean;
  freshnessThreshold: number;
  freshnessLinks: number;
}

export default function ProjectPage() {
  const [, params] = useRoute("/project/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [uploadId, setUploadId] = useState<string>("");
  const [helpDialog, setHelpDialog] = useState<string | null>(null);
  const [rules, setRules] = useState<LinkingRules>({
    maxLinks: 5,
    minDistance: 50,
    exactPercent: 20,
    scenarios: {
      headConsolidation: true,
      clusterCrossLink: true,
      commercialRouting: true,
      orphanFix: true,
      depthLift: true,
    },
    depthThreshold: 5,
    oldLinksPolicy: 'enrich',
    dedupeLinks: true,
    brokenLinksPolicy: 'delete',
    stopAnchors: ['читать далее', 'подробнее', 'здесь', 'жмите сюда', 'click here', 'learn more'],
    moneyPages: [],
    freshnessPush: true,
    freshnessThreshold: 30,
    freshnessLinks: 1,
  });

  // Get project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId!);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setCsvPreview(data.preview);
      setUploadId(data.uploadId);
      setCurrentStep(2);
      toast({
        title: "Файл загружен",
        description: "Теперь сопоставьте поля с данными",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Field mapping mutation
  const mappingMutation = useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      const response = await fetch("/api/field-mapping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uploadId,
          fieldMapping: mapping,
        }),
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Field mapping failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(3);
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      toast({
        title: "Поля сопоставлены",
        description: "Теперь настройте базовые правила перелинковки",
      });
    },
  });

  // Rules saving mutation
  const rulesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          limits: {
            maxLinks: rules.maxLinks,
            minDistance: rules.minDistance,
            exactPercent: rules.exactPercent,
          },
          scenarios: rules.scenarios,
          depthThreshold: rules.depthThreshold,
          oldLinksPolicy: rules.oldLinksPolicy,
          dedupeLinks: rules.dedupeLinks,
          brokenLinksPolicy: rules.brokenLinksPolicy,
          stopAnchors: rules.stopAnchors,
          moneyPages: rules.moneyPages,
          freshnessPush: rules.freshnessPush,
          freshnessThreshold: rules.freshnessThreshold,
          freshnessLinks: rules.freshnessLinks,
        }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Ошибка сохранения правил");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(4);
      toast({
        title: "Правила сохранены",
        description: "Настройка проекта завершена",
      });
    },
  });

  // Import start mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/import/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Ошибка запуска импорта");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      toast({
        title: "Импорт запущен",
        description: "Анализ контента начат",
      });
      // Navigate back to dashboard or import status page
      window.history.back();
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.json')) {
      toast({
        title: "Неподдерживаемый формат",
        description: "Поддерживаются только CSV и JSON файлы",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    setCsvPreview(null);
    setFieldMapping({});
    uploadMutation.mutate(file);
  };

  const updateFieldMapping = (originalField: string, mappedField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [originalField]: mappedField
    }));
  };

  const handleSubmitMapping = () => {
    mappingMutation.mutate(fieldMapping);
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto text-center py-16">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Проект не найден</h1>
          <p className="text-gray-600">Возможно, проект был удален или у вас нет доступа к нему.</p>
        </div>
      </div>
    );
  }

  const steps = [
    { number: 1, title: "Загрузка контента", description: "CSV или JSON файл с контентом сайта" },
    { number: 2, title: "Сопоставление полей", description: "Укажите какие поля содержат заголовки, URL и контент" },
    { number: 3, title: "Базовые правила", description: "Настройте правила перелинковки" },
    { number: 4, title: "Настройка завершена", description: "Контент загружен и готов к обработке" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Настройка проекта: {project?.name || 'Загрузка...'}
          </h1>
          <p className="text-gray-600 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {project?.domain || 'Загрузка...'}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {currentStep > step.number ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{step.number}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-0.5 mx-4 ${
                    currentStep > step.number ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {steps[currentStep - 1]?.title}
            </h2>
            <p className="text-gray-600 text-sm">
              {steps[currentStep - 1]?.description}
            </p>
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-8">
            {currentStep === 1 && (
              <div className="text-center space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Загрузите файл с контентом
                  </h3>
                  <p className="text-sm text-gray-600">
                    Загрузите CSV или JSON файл с контентом вашего сайта
                  </p>
                  
                  <div className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
                    uploadMutation.isPending ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                  }`}>
                    {uploadMutation.isPending ? (
                      <div className="space-y-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-blue-600 font-medium">Обрабатываем файл...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                        <div>
                          <Button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            size="lg"
                          >
                            Выбрать файл
                          </Button>
                          <p className="text-xs text-gray-500 mt-2">
                            CSV, JSON до 10MB
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.json"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={uploadMutation.isPending}
                    />
                  </div>

                  {uploadedFile && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-600" />
                        <span className="text-sm text-green-800">{uploadedFile.name}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <a
                      href="data:text/csv;charset=utf-8,title%2Curl%2Ccontent%2Cmeta_description%0A%22%D0%9A%D0%B0%D0%BA%20%D0%B2%D1%8B%D0%B1%D1%80%D0%B0%D1%82%D1%8C%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%BE%22%2C%22%2Fblog%2Fseo-agency%22%2C%22%D0%9F%D0%BE%D0%BB%D0%BD%D0%BE%D0%B5%20%D1%80%D1%83%D0%BA%D0%BE%D0%B2%D0%BE%D0%B4%D1%81%D1%82%D0%B2%D0%BE%20%D0%BF%D0%BE%20%D0%B2%D1%8B%D0%B1%D0%BE%D1%80%D1%83%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%B0...%22%2C%22%D0%A3%D0%B7%D0%BD%D0%B0%D0%B9%D1%82%D0%B5%20%D0%BA%D0%B0%D0%BA%20%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D1%8C%D0%BD%D0%BE%20%D0%B2%D1%8B%D0%B1%D1%80%D0%B0%D1%82%D1%8C%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%BE%22%0A%22%D0%92%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D0%B5%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B8%20%D0%B2%20SEO%22%2C%22%2Fblog%2Finternal-links%22%2C%22%D0%92%-%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D0%B5%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B8%20%D0%B8%D0%B3%D1%80%D0%B0%D1%8E%D1%82%20%D0%B2%D0%B0%D0%B6%D0%BD%D1%83%D1%8E%20%D1%80%D0%BE%D0%BB%D1%8C...%22%2C%22%D0%92%D1%81%D0%B5%20%D0%BE%20%D0%B2%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D1%85%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B0%D1%85%20%D0%B4%D0%BB%D1%8F%20SEO%22%0A%22%D0%90%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2%22%2C%22%2Fservices%2Fcompetitor-analysis%22%2C%22%D0%9F%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D0%B8%D0%BC%20%D0%B3%D0%BB%D1%83%D0%B1%D0%BE%D0%BA%D0%B8%D0%B9%20%D0%B0%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2...%22%2C%22%D0%90%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2%20%D0%B4%D0%BB%D1%8F%20%D1%83%D1%81%D0%BF%D0%B5%D1%88%D0%BD%D0%BE%D0%B3%D0%BE%20SEO%22"
                      download="sample_content.csv"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Download className="h-4 w-4" />
                      Скачать пример CSV
                    </a>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && csvPreview && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Сопоставьте поля
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Укажите какие поля из вашего файла содержат заголовки, URL и контент страниц
                  </p>
                </div>

                {/* Preview table */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Превью данных:</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-300">
                          {csvPreview.headers.map((header, index) => (
                            <th key={index} className="text-left py-3 px-4 font-medium text-gray-700 bg-white border-r border-gray-200">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {csvPreview.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-gray-100">
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="py-3 px-4 text-gray-600 border-r border-gray-100 max-w-xs">
                                <div className="truncate" title={cell || ''}>
                                  {cell && cell.length > 40 ? `${cell.substring(0, 40)}...` : cell || '—'}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Field mapping */}
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с заголовками страниц <span className="text-red-500">*</span>
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("title", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с URL страниц <span className="text-red-500">*</span>
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("url", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с контентом страниц <span className="text-red-500">*</span>
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("content", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с meta description
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("meta_description", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле (опционально)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не использовать</SelectItem>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с ключевыми словами
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("keywords", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле (опционально)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не использовать</SelectItem>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Поле с категорией/типом страницы
                      </Label>
                      <Select onValueChange={(value) => updateFieldMapping("category", value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Выберите поле (опционально)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не использовать</SelectItem>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Назад
                  </Button>
                  <Button
                    onClick={handleSubmitMapping}
                    disabled={mappingMutation.isPending || !fieldMapping.title || !fieldMapping.url || !fieldMapping.content}
                  >
                    {mappingMutation.isPending ? "Сохраняем..." : "Продолжить"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Базовые правила перелинковки
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Настройте основные параметры для создания внутренних ссылок
                  </p>
                </div>

                {/* A. Лимиты ссылок */}
                <div className="space-y-4">
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Лимиты ссылок</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Макс. ссылок на страницу: {rules.maxLinks}
                        </Label>
                        <Slider
                          value={[rules.maxLinks]}
                          onValueChange={(value) => setRules(prev => ({ ...prev, maxLinks: value[0] }))}
                          max={10}
                          min={1}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>1</span>
                          <span>10</span>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Мин. расстояние, слов: {rules.minDistance}
                        </Label>
                        <Slider
                          value={[rules.minDistance]}
                          onValueChange={(value) => setRules(prev => ({ ...prev, minDistance: value[0] }))}
                          max={200}
                          min={10}
                          step={10}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>10</span>
                          <span>200</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* B. Доля точных анкоров */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Доля точных анкоров</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <div className="max-w-md">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">
                        Точные анкоры ≤ {rules.exactPercent}%
                      </Label>
                      <Slider
                        value={[rules.exactPercent]}
                        onValueChange={(value) => setRules(prev => ({ ...prev, exactPercent: value[0] }))}
                        max={50}
                        min={0}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                      </div>
                    </div>
                  </div>

                  {/* C. Сценарии перелинковки */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Сценарии перелинковки</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="head-consolidation" className="text-sm text-gray-700">
                          Консолидация заголовков
                        </Label>
                        <Switch
                          id="head-consolidation"
                          checked={rules.scenarios.headConsolidation}
                          onCheckedChange={(checked) => setRules(prev => ({
                            ...prev,
                            scenarios: { ...prev.scenarios, headConsolidation: checked }
                          }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="cluster-cross-link" className="text-sm text-gray-700">
                          Кросс-линковка кластеров
                        </Label>
                        <Switch
                          id="cluster-cross-link"
                          checked={rules.scenarios.clusterCrossLink}
                          onCheckedChange={(checked) => setRules(prev => ({
                            ...prev,
                            scenarios: { ...prev.scenarios, clusterCrossLink: checked }
                          }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="commercial-routing" className="text-sm text-gray-700">
                          Коммерческая маршрутизация
                        </Label>
                        <Switch
                          id="commercial-routing"
                          checked={rules.scenarios.commercialRouting}
                          onCheckedChange={(checked) => setRules(prev => ({
                            ...prev,
                            scenarios: { ...prev.scenarios, commercialRouting: checked }
                          }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="orphan-fix" className="text-sm text-gray-700">
                          Исправление сирот
                        </Label>
                        <Switch
                          id="orphan-fix"
                          checked={rules.scenarios.orphanFix}
                          onCheckedChange={(checked) => setRules(prev => ({
                            ...prev,
                            scenarios: { ...prev.scenarios, orphanFix: checked }
                          }))}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="depth-lift" className="text-sm text-gray-700">
                          Depth Lift
                        </Label>
                        <Switch
                          id="depth-lift"
                          checked={rules.scenarios.depthLift}
                          onCheckedChange={(checked) => setRules(prev => ({
                            ...prev,
                            scenarios: { ...prev.scenarios, depthLift: checked }
                          }))}
                        />
                      </div>
                      
                      {rules.scenarios.depthLift && (
                        <div className="ml-6 mt-2">
                          <Label className="text-sm text-gray-600 mb-2 block">
                            Глубиной считать URL ≥ {rules.depthThreshold}
                          </Label>
                          <Slider
                            value={[rules.depthThreshold]}
                            onValueChange={(value) => setRules(prev => ({ ...prev, depthThreshold: value[0] }))}
                            max={8}
                            min={4}
                            step={1}
                            className="w-32"
                          />
                          <div className="flex justify-between text-xs text-gray-400 mt-1 w-32">
                            <span>4</span>
                            <span>8</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* D. Старые ссылки */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Старые ссылки</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm text-gray-700 mb-2 block">Политика обработки</Label>
                        <Select 
                          value={rules.oldLinksPolicy} 
                          onValueChange={(value: 'enrich' | 'regenerate' | 'audit') => 
                            setRules(prev => ({ ...prev, oldLinksPolicy: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enrich">Дополнить (существующие + новые)</SelectItem>
                            <SelectItem value="regenerate">Пересоздать все</SelectItem>
                            <SelectItem value="audit">Только аудит</SelectItem>
                          </SelectContent>
                        </Select>
                        </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="dedupe-links" className="text-sm text-gray-700">
                          Удалять дубли ссылок на один URL
                        </Label>
                        <Switch
                          id="dedupe-links"
                          checked={rules.dedupeLinks}
                          onCheckedChange={(checked) => setRules(prev => ({ ...prev, dedupeLinks: checked }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* E. Битые ссылки */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Битые (404) ссылки</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <div>
                      <Label className="text-sm text-gray-700 mb-2 block">Действие с битыми ссылками</Label>
                      <Select 
                        value={rules.brokenLinksPolicy} 
                        onValueChange={(value: 'delete' | 'replace' | 'ignore') => 
                          setRules(prev => ({ ...prev, brokenLinksPolicy: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delete">Удалить</SelectItem>
                          <SelectItem value="replace">Заменить</SelectItem>
                          <SelectItem value="ignore">Игнорировать</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* F. Stop-лист анкор-фраз */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Запрещенные анкоры</h4>
                      <Button variant="link" size="sm" className="text-blue-600 p-0">
                        <Info className="h-4 w-4 mr-1" />
                        Подробнее
                      </Button>
                    </div>
                    
                    <Textarea
                      placeholder="Введите фразы, разделенные запятой"
                      value={rules.stopAnchors.join(', ')}
                      onChange={(e) => setRules(prev => ({ 
                        ...prev, 
                        stopAnchors: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }))}
                      className="min-h-[80px]"
                    />
                  </div>

                  {/* G. Freshness / Boost новых страниц */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Продвижение новых страниц</h4>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" size="sm" className="text-blue-600 p-0">
                            <Info className="h-4 w-4 mr-1" />
                            Подробнее
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Freshness Push</DialogTitle>
                            <DialogDescription>
                              Автоматическое продвижение свежего контента
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                              <Play className="h-16 w-16 text-gray-400" />
                              <span className="ml-2 text-gray-500">Видео-объяснение</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Новые страницы получают дополнительные ссылки от старых материалов 
                              для быстрого продвижения в поисковой выдаче.
                            </p>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="freshness-push" className="text-sm text-gray-700">
                          Включить Freshness Push
                        </Label>
                        <Switch
                          id="freshness-push"
                          checked={rules.freshnessPush}
                          onCheckedChange={(checked) => setRules(prev => ({ ...prev, freshnessPush: checked }))}
                        />
                      </div>
                      
                      {rules.freshnessPush && (
                        <div className="ml-6 space-y-4">
                          <div>
                            <Label className="text-sm text-gray-600 mb-2 block">
                              Считать статью новой, если опубликована ≤ {rules.freshnessThreshold} дн.
                            </Label>
                            <Input
                              type="number"
                              value={rules.freshnessThreshold}
                              onChange={(e) => setRules(prev => ({ ...prev, freshnessThreshold: parseInt(e.target.value) || 30 }))}
                              min={1}
                              max={365}
                              className="w-32"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-sm text-gray-600 mb-2 block">
                              Ставить до {rules.freshnessLinks} ссылк{rules.freshnessLinks === 1 ? 'и' : rules.freshnessLinks < 5 ? 'и' : ''} из каждой "вечнозелёной" статьи
                            </Label>
                            <Slider
                              value={[rules.freshnessLinks]}
                              onValueChange={(value) => setRules(prev => ({ ...prev, freshnessLinks: value[0] }))}
                              max={3}
                              min={0}
                              step={1}
                              className="w-48"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1 w-48">
                              <span>0</span>
                              <span>3</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* H. Приоритетные URL */}
                  <div className="pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Приоритетные страницы</h4>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" size="sm" className="text-blue-600 p-0">
                            <Info className="h-4 w-4 mr-1" />
                            Подробнее
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Приоритетные страницы</DialogTitle>
                            <DialogDescription>
                              Money-страницы для усиленной перелинковки
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                              <Play className="h-16 w-16 text-gray-400" />
                              <span className="ml-2 text-gray-500">Видео-объяснение</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              Указанные страницы получат больше входящих ссылок 
                              для повышения их позиций в поисковой выдаче.
                            </p>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    
                    <Textarea
                      placeholder="Введите URL, разделенные запятой (https://example.com/page1, https://example.com/page2)"
                      value={rules.moneyPages.join(', ')}
                      onChange={(e) => {
                        const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        setRules(prev => ({ ...prev, moneyPages: urls }));
                      }}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(2)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Назад
                  </Button>
                  <Button 
                    onClick={() => rulesMutation.mutate()}
                    disabled={rulesMutation.isPending}
                  >
                    {rulesMutation.isPending ? "Сохраняем..." : "Сохранить и продолжить"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="text-center space-y-6">
                <div className="space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
                  <h3 className="text-xl font-semibold text-gray-900">
                    Контент успешно загружен!
                  </h3>
                  <p className="text-gray-600">
                    Ваш контент обработан и готов для создания внутренних ссылок.
                    Теперь вы можете запустить импорт и анализ.
                  </p>
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => window.history.back()}>
                    Вернуться к проектам
                  </Button>
                  <Button 
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {importMutation.isPending ? "Запускаем..." : "Запустить импорт"}
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