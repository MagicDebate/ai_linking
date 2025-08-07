import { useState, useRef, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Info,
  Loader2
} from "lucide-react";

interface FieldMapping {
  [key: string]: string;
}

interface CsvPreview {
  headers: string[];
  rows: string[][];
  uploadId?: string;
}

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "QUEUED" | "READY";
  updatedAt: string;
}

// Основные настройки согласно ТЗ
interface SEOProfile {
  preset: 'basic' | 'ecommerce' | 'freshness' | 'custom';
  
  // Лимиты
  maxLinks: number;           // 1-10
  minGap: number;            // 50-400 слов
  exactAnchorPercent: number; // 0-50%
  
  // Стоп-лист и money URLs
  stopAnchors: string[];
  moneyUrls: string[];
  
  // Сценарии ON/OFF + настройки
  scenarios: {
    orphanFix: boolean;
    headConsolidation: boolean;
    clusterCrossLink: boolean;
    commercialRouting: boolean;
    depthLift: {
      enabled: boolean;
      minDepth: number; // 3-8
    };
    freshnessPush: {
      enabled: boolean;
      daysFresh: number; // 7-60
      linksPerDonor: number; // 0-3
    };
  };
  
  // Каннибализация
  cannibalization: {
    threshold: 'low' | 'medium' | 'high'; // 0.75/0.80/0.85
    action: 'block' | 'flag';
    canonicRule: 'content' | 'url' | 'manual';
  };
  
  // Политики ссылок
  policies: {
    oldLinks: 'enrich' | 'regenerate' | 'audit';
    removeDuplicates: boolean;
    brokenLinks: 'delete' | 'replace' | 'ignore';
  };
  
  // HTML атрибуты
  htmlAttributes: {
    className: string;
    rel: {
      noopener: boolean;
      noreferrer: boolean;
      nofollow: boolean;
    };
    targetBlank: boolean;
    classMode: 'append' | 'replace';
  };
}

const DEFAULT_PROFILE: SEOProfile = {
  preset: 'basic',
  maxLinks: 3,
  minGap: 100,
  exactAnchorPercent: 20,
  stopAnchors: [],
  moneyUrls: [],
  scenarios: {
    orphanFix: true,
    headConsolidation: true,
    clusterCrossLink: true,
    commercialRouting: true,
    depthLift: { enabled: true, minDepth: 5 },
    freshnessPush: { enabled: true, daysFresh: 30, linksPerDonor: 1 }
  },
  cannibalization: {
    threshold: 'medium',
    action: 'block',
    canonicRule: 'content'
  },
  policies: {
    oldLinks: 'enrich',
    removeDuplicates: true,
    brokenLinks: 'replace'
  },
  htmlAttributes: {
    className: '',
    rel: { noopener: false, noreferrer: false, nofollow: false },
    targetBlank: false,
    classMode: 'append'
  }
};

const PRESETS = {
  basic: {
    ...DEFAULT_PROFILE,
    scenarios: {
      orphanFix: true,
      headConsolidation: true,
      clusterCrossLink: true,
      commercialRouting: true,
      depthLift: { enabled: true, minDepth: 5 },
      freshnessPush: { enabled: true, daysFresh: 30, linksPerDonor: 1 }
    }
  },
  ecommerce: {
    ...DEFAULT_PROFILE,
    scenarios: {
      orphanFix: true,
      headConsolidation: true,
      clusterCrossLink: false,
      commercialRouting: true,
      depthLift: { enabled: true, minDepth: 4 },
      freshnessPush: { enabled: false, daysFresh: 30, linksPerDonor: 1 }
    }
  },
  freshness: {
    ...DEFAULT_PROFILE,
    scenarios: {
      orphanFix: false,
      headConsolidation: false,
      clusterCrossLink: false,
      commercialRouting: false,
      depthLift: { enabled: false, minDepth: 5 },
      freshnessPush: { enabled: true, daysFresh: 30, linksPerDonor: 1 }
    }
  }
};

export default function ProjectUnifiedSpec() {
  const [, params] = useRoute("/project/:id");
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Шаги согласно ТЗ
  const [currentStep, setCurrentStep] = useState(1);
  
  // Шаг 1: CSV данные
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  
  // Шаг 2: SEO профиль
  const [seoProfile, setSeoProfile] = useState<SEOProfile>(DEFAULT_PROFILE);
  
  // Загрузка проекта
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['/api/projects', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      return response.json() as Promise<Project>;
    },
    enabled: !!projectId
  });

  // Мутация загрузки файла
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId!);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: (data) => {
      console.log('Upload success:', data);
      setCsvPreview({ ...data.preview, uploadId: data.uploadId });
      setCurrentStep(2);
      toast({ title: "Файл загружен!" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка загрузки", description: error.message, variant: "destructive" });
    }
  });

  // Мутация сохранения маппинга
  const mappingMutation = useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      const response = await fetch('/api/field-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId, 
          mapping,
          uploadId: csvPreview?.uploadId // Передаем uploadId из ответа загрузки
        })
      });
      if (!response.ok) throw new Error('Mapping save failed');
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(3);
      toast({ title: "Маппинг сохранен!" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    }
  });

  // Мутация сохранения профиля
  const profileMutation = useMutation({
    mutationFn: async (profile: SEOProfile) => {
      const response = await fetch('/api/seo-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId, 
          profile 
        })
      });
      if (!response.ok) throw new Error('Profile save failed');
      return response.json();
    },
    onSuccess: async () => {
      toast({ title: "Настройки сохранены!" });
      setCurrentStep(4);
      // Запускаем импорт автоматически
      if (csvPreview?.uploadId) {
        startImportMutation.mutate();
      }
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    }
  });

  // Мутация запуска импорта
  const startImportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          uploadId: csvPreview?.uploadId 
        })
      });
      if (!response.ok) throw new Error('Import start failed');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Импорт запущен!" });
    },
    onError: (error: any) => {
      toast({ title: "Ошибка импорта", description: error.message, variant: "destructive" });
    }
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

  const applyPreset = (preset: keyof typeof PRESETS) => {
    setSeoProfile(PRESETS[preset]);
  };

  if (projectLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-4xl mx-auto text-center py-16">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Проект не найден</h1>
            <p className="text-gray-600">Возможно, проект был удален или у вас нет доступа к нему.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const steps = [
    { number: 1, title: "Загрузка и маппинг CSV", description: "Загрузите файл и настройте поля" },
    { number: 2, title: "Базовые настройки (SEO-профиль)", description: "Пресеты и основные параметры" },
    { number: 3, title: "Прогресс импорта", description: "Обработка контента" },
    { number: 4, title: "Настройка области генерации", description: "Выбор scope" },
  ];

  return (
    <Layout>
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
              Настройка проекта: {(project as Project)?.name || 'Загрузка...'}
            </h1>
            <p className="text-gray-600 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              {(project as Project)?.domain || 'Загрузка...'}
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
              {/* Шаг 1: Загрузка и маппинг CSV */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Загрузите CSV файл
                    </h3>
                    <p className="text-sm text-gray-600">
                      Файл должен содержать: URL, Текст, meta_title, meta_description, pub_date, lang
                    </p>
                    
                    <div className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
                      uploadMutation.isPending ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                    }`}>
                      {uploadMutation.isPending ? (
                        <div className="space-y-4">
                          <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
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
                              Выбрать CSV файл
                            </Button>
                            <p className="text-xs text-gray-500 mt-2">
                              CSV до 10MB
                            </p>
                          </div>
                        </div>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv"
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
                        href="data:text/csv;charset=utf-8,url%2Ctitle%2Ccontent%2Cmeta_title%2Cmeta_description%2Cpub_date%2Clang%0A%22%2Fblog%2Fseo-tips%22%2C%22SEO%20%D1%81%D0%BE%D0%B2%D0%B5%D1%82%D1%8B%22%2C%22%D0%9F%D0%BE%D0%BB%D0%BD%D0%BE%D0%B5%20%D1%80%D1%83%D0%BA%D0%BE%D0%B2%D0%BE%D0%B4%D1%81%D1%82%D0%B2%D0%BE...%22%2C%22%D0%9B%D1%83%D1%87%D1%88%D0%B8%D0%B5%20SEO%20%D1%81%D0%BE%D0%B2%D0%B5%D1%82%D1%8B%22%2C%22%D0%98%D0%B7%D1%83%D1%87%D0%B8%D1%82%D0%B5%20%D1%8D%D1%84%D1%84%D0%B5%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D1%8B%D0%B5%20SEO%20%D1%81%D1%82%D1%80%D0%B0%D1%82%D0%B5%D0%B3%D0%B8%D0%B8%22%2C%222024-01-15%22%2C%22ru%22%0A%22%2Fservices%2Fconsulting%22%2C%22SEO%20%D0%BA%D0%BE%D0%BD%D1%81%D0%B0%D0%BB%D1%82%D0%B8%D0%BD%D0%B3%22%2C%22%D0%9F%D1%80%D0%BE%D1%84%D0%B5%D1%81%D1%81%D0%B8%D0%BE%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D0%B9%20SEO%20%D0%BA%D0%BE%D0%BD%D1%81%D0%B0%D0%BB%D1%82%D0%B8%D0%BD%D0%B3...%22%2C%22SEO%20%D0%BA%D0%BE%D0%BD%D1%81%D0%B0%D0%BB%D1%82%D0%B8%D0%BD%D0%B3%20%D0%B4%D0%BB%D1%8F%20%D0%B1%D0%B8%D0%B7%D0%BD%D0%B5%D1%81%D0%B0%22%2C%22%D0%9F%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D0%B5%20%D1%8D%D0%BA%D1%81%D0%BF%D0%B5%D1%80%D1%82%D0%BD%D1%8B%D0%B5%20SEO%20%D1%80%D0%B5%D0%BA%D0%BE%D0%BC%D0%B5%D0%BD%D0%B4%D0%B0%D1%86%D0%B8%D0%B8%22%2C%222024-01-10%22%2C%22ru%22"
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

              {/* Шаг 2: Маппинг полей (показываем только если есть preview) */}
              {currentStep === 2 && csvPreview && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Сопоставьте поля
                    </h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Укажите какие столбцы содержат: URL, Текст, meta_title, meta_description, pub_date, lang
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
                          {csvPreview.rows.slice(0, 3).map((row, rowIndex) => (
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
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Сопоставление полей</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'url', label: 'URL страницы', required: true },
                        { key: 'title', label: 'Заголовок (текст)', required: true },
                        { key: 'content', label: 'Контент страницы', required: true },
                        { key: 'meta_title', label: 'Meta Title', required: false },
                        { key: 'meta_description', label: 'Meta Description', required: false },
                        { key: 'pub_date', label: 'Дата публикации', required: false },
                        { key: 'lang', label: 'Язык', required: false }
                      ].map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={field.key} className="flex items-center gap-2">
                            {field.label}
                            {field.required && <span className="text-red-500">*</span>}
                          </Label>
                          <Select
                            value={fieldMapping[field.key] || '__none__'}
                            onValueChange={(value) => updateFieldMapping(field.key, value === '__none__' ? '' : value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите столбец" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Не используется</SelectItem>
                              {csvPreview.headers.map((header) => (
                                <SelectItem key={header} value={header}>
                                  {header}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
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
                      onClick={() => mappingMutation.mutate(fieldMapping)}
                      disabled={mappingMutation.isPending || !fieldMapping.url || !fieldMapping.title || !fieldMapping.content}
                    >
                      {mappingMutation.isPending ? "Сохраняем..." : "Продолжить"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Шаг 3: Базовые настройки (SEO-профиль) */}
              {currentStep === 3 && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Базовые настройки (SEO-профиль)
                    </h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Выберите пресет или настройте параметры вручную
                    </p>
                  </div>

                  {/* Пресеты */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Пресеты</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { key: 'basic' as const, title: 'Базовый', desc: 'Все сценарии включены' },
                        { key: 'ecommerce' as const, title: 'E-commerce', desc: 'Без кросс-линков' },
                        { key: 'freshness' as const, title: 'Свежесть', desc: 'Только новый контент' },
                        { key: 'custom' as const, title: 'Другое', desc: 'Ручная настройка' }
                      ].map((preset) => (
                        <div
                          key={preset.key}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            seoProfile.preset === preset.key 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => {
                            if (preset.key !== 'custom') {
                              applyPreset(preset.key);
                            }
                            setSeoProfile(prev => ({ ...prev, preset: preset.key }));
                          }}
                        >
                          <h5 className={`font-medium ${seoProfile.preset === preset.key ? 'text-blue-900' : 'text-gray-900'}`}>
                            {preset.title}
                          </h5>
                          <p className={`text-sm ${seoProfile.preset === preset.key ? 'text-blue-700' : 'text-gray-600'}`}>
                            {preset.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Основные параметры */}
                  <div className="space-y-6">
                    <h4 className="font-medium text-gray-900">Основные параметры</h4>
                    
                    {/* Лимиты */}
                    <div className="space-y-4">
                      <h5 className="text-sm font-medium text-gray-800">Лимиты</h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <Label>Максимум ссылок на страницу: {seoProfile.maxLinks}</Label>
                          <Slider
                            value={[seoProfile.maxLinks]}
                            onValueChange={([value]) => setSeoProfile(prev => ({ ...prev, maxLinks: value }))}
                            min={1}
                            max={10}
                            step={1}
                            className="mt-2"
                          />
                        </div>
                        
                        <div>
                          <Label>Минимальное расстояние: {seoProfile.minGap} слов</Label>
                          <Slider
                            value={[seoProfile.minGap]}
                            onValueChange={([value]) => setSeoProfile(prev => ({ ...prev, minGap: value }))}
                            min={50}
                            max={400}
                            step={10}
                            className="mt-2"
                          />
                        </div>
                        
                        <div>
                          <Label>Точные анкоры: {seoProfile.exactAnchorPercent}%</Label>
                          <Slider
                            value={[seoProfile.exactAnchorPercent]}
                            onValueChange={([value]) => setSeoProfile(prev => ({ ...prev, exactAnchorPercent: value }))}
                            min={0}
                            max={50}
                            step={5}
                            className="mt-2"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Стоп-лист и money URLs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="stopAnchors">Стоп-лист анкоров</Label>
                        <Textarea
                          id="stopAnchors"
                          placeholder="Введите фразы через запятую"
                          value={seoProfile.stopAnchors.join(', ')}
                          onChange={(e) => {
                            const anchors = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                            setSeoProfile(prev => ({ ...prev, stopAnchors: anchors }));
                          }}
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="moneyUrls">Приоритетные (money) URL</Label>
                        <Textarea
                          id="moneyUrls"
                          placeholder="Введите URL через запятую"
                          value={seoProfile.moneyUrls.join(', ')}
                          onChange={(e) => {
                            const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                            setSeoProfile(prev => ({ ...prev, moneyUrls: urls }));
                          }}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Сценарии */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Сценарии</h4>
                    <div className="space-y-4">
                      {/* Простые сценарии */}
                      {[
                        { key: 'orphanFix', title: 'Orphan Fix', desc: 'Исправление сирот' },
                        { key: 'headConsolidation', title: 'Head Consolidation', desc: 'Консолидация главных страниц' },
                        { key: 'clusterCrossLink', title: 'Cluster Cross-Link', desc: 'Перекрестные ссылки в кластерах' },
                        { key: 'commercialRouting', title: 'Commercial Routing', desc: 'Маршрутизация на коммерческие страницы' }
                      ].map((scenario) => (
                        <div key={scenario.key} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h5 className="font-medium">{scenario.title}</h5>
                            <p className="text-sm text-gray-600">{scenario.desc}</p>
                          </div>
                          <Switch
                            checked={seoProfile.scenarios[scenario.key as keyof typeof seoProfile.scenarios] as boolean}
                            onCheckedChange={(checked) => setSeoProfile(prev => ({
                              ...prev,
                              scenarios: { ...prev.scenarios, [scenario.key]: checked }
                            }))}
                          />
                        </div>
                      ))}

                      {/* Depth Lift */}
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h5 className="font-medium">Depth Lift</h5>
                            <p className="text-sm text-gray-600">Поднятие глубоких страниц</p>
                          </div>
                          <Switch
                            checked={seoProfile.scenarios.depthLift.enabled}
                            onCheckedChange={(checked) => setSeoProfile(prev => ({
                              ...prev,
                              scenarios: { 
                                ...prev.scenarios, 
                                depthLift: { ...prev.scenarios.depthLift, enabled: checked }
                              }
                            }))}
                          />
                        </div>
                        {seoProfile.scenarios.depthLift.enabled && (
                          <div>
                            <Label>Минимальная глубина: {seoProfile.scenarios.depthLift.minDepth} кликов</Label>
                            <Slider
                              value={[seoProfile.scenarios.depthLift.minDepth]}
                              onValueChange={([value]) => setSeoProfile(prev => ({
                                ...prev,
                                scenarios: { 
                                  ...prev.scenarios, 
                                  depthLift: { ...prev.scenarios.depthLift, minDepth: value }
                                }
                              }))}
                              min={3}
                              max={8}
                              step={1}
                              className="mt-2"
                            />
                          </div>
                        )}
                      </div>

                      {/* Freshness Push */}
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h5 className="font-medium">Freshness Push</h5>
                            <p className="text-sm text-gray-600">Продвижение свежего контента</p>
                          </div>
                          <Switch
                            checked={seoProfile.scenarios.freshnessPush.enabled}
                            onCheckedChange={(checked) => setSeoProfile(prev => ({
                              ...prev,
                              scenarios: { 
                                ...prev.scenarios, 
                                freshnessPush: { ...prev.scenarios.freshnessPush, enabled: checked }
                              }
                            }))}
                          />
                        </div>
                        {seoProfile.scenarios.freshnessPush.enabled && (
                          <div className="space-y-4">
                            <div>
                              <Label>Свежесть: {seoProfile.scenarios.freshnessPush.daysFresh} дней</Label>
                              <Slider
                                value={[seoProfile.scenarios.freshnessPush.daysFresh]}
                                onValueChange={([value]) => setSeoProfile(prev => ({
                                  ...prev,
                                  scenarios: { 
                                    ...prev.scenarios, 
                                    freshnessPush: { ...prev.scenarios.freshnessPush, daysFresh: value }
                                  }
                                }))}
                                min={7}
                                max={60}
                                step={1}
                                className="mt-2"
                              />
                            </div>
                            <div>
                              <Label>Ссылок на донора: {seoProfile.scenarios.freshnessPush.linksPerDonor}</Label>
                              <Slider
                                value={[seoProfile.scenarios.freshnessPush.linksPerDonor]}
                                onValueChange={([value]) => setSeoProfile(prev => ({
                                  ...prev,
                                  scenarios: { 
                                    ...prev.scenarios, 
                                    freshnessPush: { ...prev.scenarios.freshnessPush, linksPerDonor: value }
                                  }
                                }))}
                                min={0}
                                max={3}
                                step={1}
                                className="mt-2"
                              />
                            </div>
                          </div>
                        )}
                      </div>
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
                      onClick={() => profileMutation.mutate(seoProfile)}
                      disabled={profileMutation.isPending || startImportMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {profileMutation.isPending ? "Сохраняем..." : 
                       startImportMutation.isPending ? "Запускаем импорт..." :
                       "Сохранить и запустить импорт"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Шаг 4: Прогресс импорта */}
              {currentStep === 4 && (
                <div className="text-center space-y-6">
                  {startImportMutation.isPending ? (
                    <div className="space-y-4">
                      <Loader2 className="h-16 w-16 text-blue-600 mx-auto animate-spin" />
                      <h3 className="text-xl font-semibold text-gray-900">
                        Запускаем импорт...
                      </h3>
                      <p className="text-gray-600">
                        Обрабатываем данные и подготавливаем контент для создания ссылок.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
                      <h3 className="text-xl font-semibold text-gray-900">
                        Настройки сохранены!
                      </h3>
                      <p className="text-gray-600">
                        Ваш контент будет обработан и готов для создания внутренних ссылок.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => window.history.back()}>
                      Вернуться к проектам
                    </Button>
                    <Button disabled={startImportMutation.isPending}>
                      <Settings className="h-4 w-4 mr-2" />
                      Перейти к генерации ссылок
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}