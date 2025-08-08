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
  
  // Стоп-лист и priority/hub URLs
  stopAnchors: string[];
  priorityPages: string[];    // Money pages for Commercial Routing
  hubPages: string[];        // Hub pages for Head Consolidation
  
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
    canonicRule: 'length' | 'url' | 'manual'; // По ТЗ: Length/URL/Manual
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
  priorityPages: [],
  hubPages: [],
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
    canonicRule: 'length'
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
          fieldMapping: mapping, // Правильное имя поля
          uploadId: csvPreview?.uploadId // Передаем uploadId из ответа загрузки
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Mapping save failed');
      }
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
      setCurrentStep(3); // Переходим на шаг импорта
      // Запускаем импорт автоматически
      console.log('🚀 Trying to start import with uploadId:', csvPreview?.uploadId);
      if (csvPreview?.uploadId) {
        // Небольшая задержка чтобы UI обновился
        setTimeout(() => {
          startImportMutation.mutate();
        }, 100);
      } else {
        console.error('❌ No uploadId available for import');
        toast({ 
          title: "Ошибка", 
          description: "Не найден ID загрузки. Попробуйте загрузить CSV снова.",
          variant: "destructive" 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    }
  });

  // Мутация запуска импорта
  const startImportMutation = useMutation({
    mutationFn: async () => {
      console.log('📤 Starting import with data:', {
        projectId,
        uploadId: csvPreview?.uploadId
      });
      
      const response = await fetch('/api/import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          uploadId: csvPreview?.uploadId 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Import start error:', errorData);
        throw new Error(errorData.error || 'Import start failed');
      }
      
      const result = await response.json();
      console.log('✅ Import start response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('🎯 Import started successfully:', data);
      toast({ title: "Импорт запущен!" });
      setImportJobId(data.jobId); // Сохраняем ID для отслеживания
    },
    onError: (error: any) => {
      console.error('❌ Import start error:', error);
      toast({ title: "Ошибка импорта", description: error.message, variant: "destructive" });
    }
  });

  // Состояние импорта
  const [importJobId, setImportJobId] = useState<string | null>(null);
  
  // Запрос статуса импорта с автообновлением
  const { data: importStatus, isLoading: importStatusLoading } = useQuery({
    queryKey: ['/api/import/status', importJobId],
    queryFn: async () => {
      if (!importJobId) return null;
      const response = await fetch(`/api/import/status/${importJobId}`);
      if (!response.ok) throw new Error('Failed to get import status');
      return response.json();
    },
    enabled: !!importJobId && currentStep === 3,
    refetchInterval: (data) => {
      // Обновляем каждую секунду пока импорт активен
      return data?.status === 'running' ? 1000 : false;
    }
  });

  // Автоматический переход на следующий шаг после завершения импорта
  useEffect(() => {
    console.log('🔄 Import status check:', { 
      importStatus, 
      currentStep, 
      importJobId,
      statusCheck: importStatus?.status 
    });
    
    if (importStatus?.status === 'completed' && currentStep === 3) {
      toast({ title: "Импорт завершен успешно!" });
      setTimeout(() => setCurrentStep(4), 1000);
    } else if (importStatus && importStatus.status === 'failed' && currentStep === 3) {
      toast({ 
        title: "Ошибка импорта", 
        description: importStatus.error || "Неизвестная ошибка",
        variant: "destructive" 
      });
    }
  }, [importStatus, currentStep, importJobId]);

  // Мутация запуска генерации ссылок с полным SEO профилем
  const generateLinksMutation = useMutation({
    mutationFn: async () => {
      console.log('🚀 Sending full SEO profile to backend:', seoProfile);
      
      const response = await fetch('/api/generate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          seoProfile  // Send complete SEO profile with all parameters
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start generation');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Генерация ссылок запущена!" });
      setCurrentStep(6); // Переходим к следующему шагу
    },
    onError: (error: any) => {
      toast({ title: "Ошибка генерации", description: error.message, variant: "destructive" });
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

  // Восстанавливаем состояние при загрузке
  useEffect(() => {
    if (projectId && !projectLoading) {
      // Проверяем есть ли импорты для этого проекта - если да, то переходим к соответствующему шагу
      const checkProjectState = async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/state`);
          if (response.ok) {
            const state = await response.json();
            // Не переходим автоматически, всегда начинаем с шага 1
            // if (state.hasImports) {
            //   setCurrentStep(state.lastCompletedStep + 1);
            // }
          }
        } catch (error) {
          console.log('No saved state found, starting from step 1');
        }
      };
      checkProjectState();
    }
  }, [projectId, projectLoading]);

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
    { number: 1, title: "Загрузка CSV и маппинг", description: "Загрузите файл и настройте поля данных" },
    { number: 2, title: "SEO профиль", description: "Настройте пресеты, сценарии и параметры" },
    { number: 3, title: "Импорт данных", description: "Обработка и анализ загруженного контента" },
    { number: 4, title: "Настройка области", description: "Выберите scope для генерации ссылок" },
    { number: 5, title: "Генерация ссылок", description: "Создание внутренних ссылок по сценариям" },
    { number: 6, title: "Проверка черновика", description: "Просмотр и редактирование предложенных ссылок" },
    { number: 7, title: "Публикация", description: "Экспорт готовых ссылок для внедрения" }
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

                    {/* Маппинг полей - показываем если есть CSV */}
                    {csvPreview && (
                      <>
                        <div className="mt-8 pt-8 border-t border-gray-200">
                          <h4 className="text-lg font-medium text-gray-900 mb-4">
                            Сопоставьте поля CSV
                          </h4>
                          <p className="text-sm text-gray-600 mb-6">
                            Укажите какие столбцы содержат: URL, Текст, meta_title, meta_description, pub_date, lang
                          </p>

                          {/* Preview table */}
                          <div className="bg-gray-50 rounded-lg p-4 mb-6">
                            <h5 className="text-sm font-medium text-gray-900 mb-3">Превью данных:</h5>
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
                              <div key={field.key} className="space-y-2">
                                <Label htmlFor={field.key} className="text-sm font-medium">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                </Label>
                                <Select
                                  value={fieldMapping[field.key as keyof typeof fieldMapping] || ''}
                                  onValueChange={(value) => setFieldMapping(prev => ({ ...prev, [field.key]: value }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Выберите столбец" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Не используется</SelectItem>
                                    {csvPreview.headers.map((header, index) => (
                                      <SelectItem key={index} value={header}>
                                        {header}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Кнопка продолжения */}
                    <div className="flex justify-center mt-8">
                      <Button
                        onClick={() => setCurrentStep(2)}
                        disabled={!csvPreview || !fieldMapping.url || !fieldMapping.title || !fieldMapping.content}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Продолжить к SEO профилю
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Удаляем старый шаг 2 - маппинг полей будет объединен с шагом 1 */}
              {false && (
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
                      onClick={() => setCurrentStep(2)}
                      disabled={!fieldMapping.url || !fieldMapping.title || !fieldMapping.content}
                    >
                      Продолжить к SEO профилю
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Шаг 2: Базовые настройки (SEO-профиль) */}
              {currentStep === 2 && csvPreview && (
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

                    {/* Стоп-лист анкоров */}
                    <div className="space-y-4">
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
                    </div>

                    {/* Priority Pages - видно только если Commercial Routing включен */}
                    {seoProfile.scenarios.commercialRouting && (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="priorityPages">Priority (Money) Pages</Label>
                          <Textarea
                            id="priorityPages"
                            placeholder="Введите URL через запятую или загрузите CSV"
                            value={seoProfile.priorityPages.join(', ')}
                            onChange={(e) => {
                              const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              setSeoProfile(prev => ({ ...prev, priorityPages: urls }));
                            }}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">URL с повышенным приоритетом при Commercial Routing. Можно загрузить CSV или ввести вручную.</p>
                        </div>
                      </div>
                    )}

                    {/* Hub Pages - видно только если Head Consolidation включен */}
                    {seoProfile.scenarios.headConsolidation && (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="hubPages">Hub Pages</Label>
                          <Textarea
                            id="hubPages"
                            placeholder="Введите URL хаб-страниц через запятую или загрузите CSV"
                            value={seoProfile.hubPages.join(', ')}
                            onChange={(e) => {
                              const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              setSeoProfile(prev => ({ ...prev, hubPages: urls }));
                            }}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">Канонические/хаб-страницы для Head Consolidation. Можно импортировать CSV (clusterId, url) или выбрать вручную.</p>
                        </div>
                      </div>
                    )}
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

                  {/* Каннибализация */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      Каннибализация
                      <Info className="h-4 w-4 text-gray-500 cursor-help" />
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <Label>Порог похожести</Label>
                        <Select
                          value={seoProfile.cannibalization.threshold}
                          onValueChange={(value: 'low' | 'medium' | 'high') => 
                            setSeoProfile(prev => ({ ...prev, cannibalization: { ...prev.cannibalization, threshold: value } }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low (0.75)</SelectItem>
                            <SelectItem value="medium">Medium (0.80)</SelectItem>
                            <SelectItem value="high">High (0.85)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Действие</Label>
                        <RadioGroup 
                          value={seoProfile.cannibalization.action}
                          onValueChange={(value: 'block' | 'flag') => 
                            setSeoProfile(prev => ({ ...prev, cannibalization: { ...prev.cannibalization, action: value } }))
                          }
                          className="mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="block" id="block" />
                            <Label htmlFor="block">Block</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="flag" id="flag" />
                            <Label htmlFor="flag">Flag only</Label>
                          </div>
                        </RadioGroup>
                      </div>
                      
                      <div>
                        <Label>Правило выбора каноника</Label>
                        <RadioGroup 
                          value={seoProfile.cannibalization.canonicRule}
                          onValueChange={(value: 'length' | 'url' | 'manual') => 
                            setSeoProfile(prev => ({ ...prev, cannibalization: { ...prev.cannibalization, canonicRule: value } }))
                          }
                          className="mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="length" id="length" />
                            <Label htmlFor="length">По полноте текста</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="url" id="url" />
                            <Label htmlFor="url">По URL-структуре</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="manual" id="manual" />
                            <Label htmlFor="manual">Manual</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  </div>

                  {/* Политики ссылок */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Политики ссылок</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <Label>Old Links Policy</Label>
                        <Select
                          value={seoProfile.policies.oldLinks}
                          onValueChange={(value: 'enrich' | 'regenerate' | 'audit') => 
                            setSeoProfile(prev => ({ ...prev, policies: { ...prev.policies, oldLinks: value } }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enrich">Enrich</SelectItem>
                            <SelectItem value="regenerate">Regenerate</SelectItem>
                            <SelectItem value="audit">Audit only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Broken-link Policy</Label>
                        <Select
                          value={seoProfile.policies.brokenLinks}
                          onValueChange={(value: 'delete' | 'replace' | 'ignore') => 
                            setSeoProfile(prev => ({ ...prev, policies: { ...prev.policies, brokenLinks: value } }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="delete">Delete</SelectItem>
                            <SelectItem value="replace">Replace</SelectItem>
                            <SelectItem value="ignore">Ignore</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-6">
                        <Switch
                          id="removeDuplicates"
                          checked={seoProfile.policies.removeDuplicates}
                          onCheckedChange={(checked) => 
                            setSeoProfile(prev => ({ ...prev, policies: { ...prev.policies, removeDuplicates: checked } }))
                          }
                        />
                        <Label htmlFor="removeDuplicates">Remove Duplicates</Label>
                      </div>
                    </div>
                  </div>

                  {/* HTML атрибуты */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">HTML Attributes</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="className">className</Label>
                        <Input
                          id="className"
                          value={seoProfile.htmlAttributes.className}
                          onChange={(e) => 
                            setSeoProfile(prev => ({ ...prev, htmlAttributes: { ...prev.htmlAttributes, className: e.target.value } }))
                          }
                          placeholder="Введите CSS класс"
                          className="mt-1"
                        />
                      </div>
                      
                      <div>
                        <Label>classMode</Label>
                        <RadioGroup 
                          value={seoProfile.htmlAttributes.classMode}
                          onValueChange={(value: 'append' | 'replace') => 
                            setSeoProfile(prev => ({ ...prev, htmlAttributes: { ...prev.htmlAttributes, classMode: value } }))
                          }
                          className="mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="append" id="append" />
                            <Label htmlFor="append">Append</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="replace" id="replace" />
                            <Label htmlFor="replace">Replace</Label>
                          </div>
                        </RadioGroup>
                      </div>
                      
                      <div>
                        <Label>rel атрибуты</Label>
                        <div className="space-y-2 mt-2">
                          {[
                            { key: 'noopener', label: 'noopener' },
                            { key: 'noreferrer', label: 'noreferrer' },
                            { key: 'nofollow', label: 'nofollow' }
                          ].map((rel) => (
                            <div key={rel.key} className="flex items-center space-x-2">
                              <Switch
                                id={rel.key}
                                checked={seoProfile.htmlAttributes.rel[rel.key as keyof typeof seoProfile.htmlAttributes.rel]}
                                onCheckedChange={(checked) => 
                                  setSeoProfile(prev => ({ 
                                    ...prev, 
                                    htmlAttributes: { 
                                      ...prev.htmlAttributes, 
                                      rel: { ...prev.htmlAttributes.rel, [rel.key]: checked } 
                                    } 
                                  }))
                                }
                              />
                              <Label htmlFor={rel.key}>{rel.label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-6">
                        <Switch
                          id="targetBlank"
                          checked={seoProfile.htmlAttributes.targetBlank}
                          onCheckedChange={(checked) => 
                            setSeoProfile(prev => ({ ...prev, htmlAttributes: { ...prev.htmlAttributes, targetBlank: checked } }))
                          }
                        />
                        <Label htmlFor="targetBlank">target="_blank"</Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStep(1)}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Назад к загрузке CSV
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

              {/* Шаг 3: Импорт данных с прогрессом - БЕЗ НАСТРОЕК SEO */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  {/* Заголовок */}
                  <div className="text-center">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Импорт и анализ контента
                    </h3>
                    <p className="text-gray-600">
                      Обрабатываем загруженные данные и подготавливаем контент для создания ссылок
                    </p>
                  </div>

                  {/* Прогресс импорта */}
                  <div className="bg-gray-50 rounded-lg p-6">
                    {(!importJobId || importStatusLoading || !importStatus) ? (
                      <div className="text-center space-y-4">
                        <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
                        <p className="text-blue-600 font-medium">
                          {!importJobId ? 'Инициализация импорта...' : 'Запускаем импорт...'}
                        </p>
                        <div className="text-xs text-gray-500">
                          JobId: {importJobId || 'не установлен'}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Прогресс бар */}
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-gray-700">
                              {importStatus.phase === 'parsing' && 'Парсинг CSV файла'}
                              {importStatus.phase === 'processing' && 'Обработка контента'}
                              {importStatus.phase === 'embedding' && 'Создание векторных представлений'}
                              {importStatus.phase === 'graph' && 'Построение графа связей'}
                              {importStatus.phase === 'cleanup' && 'Финализация'}
                              {importStatus.phase === 'completed' && 'Импорт завершен'}
                            </span>
                            <span className="text-blue-600 font-medium">
                              {importStatus.percent}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                              className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${importStatus.percent}%` }}
                            />
                          </div>
                        </div>

                        {/* Статистика */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-white rounded-lg p-4">
                            <div className="text-2xl font-bold text-gray-900">
                              {importStatus.stats?.totalPages || 0}
                            </div>
                            <div className="text-sm text-gray-600">Страниц обработано</div>
                          </div>
                          <div className="bg-white rounded-lg p-4">
                            <div className="text-2xl font-bold text-gray-900">
                              {importStatus.stats?.totalBlocks || 0}
                            </div>
                            <div className="text-sm text-gray-600">Блоков контента</div>
                          </div>
                          <div className="bg-white rounded-lg p-4">
                            <div className="text-2xl font-bold text-gray-900">
                              {importStatus.stats?.totalWords || 0}
                            </div>
                            <div className="text-sm text-gray-600">Слов проанализировано</div>
                          </div>
                        </div>

                        {/* Детали текущей фазы */}
                        {importStatus.currentItem && (
                          <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                            <div className="text-sm text-gray-600 mb-1">Обрабатываем:</div>
                            <div className="font-medium text-gray-900 truncate">
                              {importStatus.currentItem}
                            </div>
                          </div>
                        )}

                        {/* Ошибки если есть */}
                        {importStatus.errors && importStatus.errors.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-start">
                              <AlertCircle className="h-5 w-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
                              <div>
                                <h4 className="text-yellow-800 font-medium mb-1">
                                  Обнаружены предупреждения ({importStatus.errors.length})
                                </h4>
                                <div className="text-yellow-700 text-sm space-y-1">
                                  {importStatus.errors.slice(0, 3).map((error: string, i: number) => (
                                    <div key={i}>• {error}</div>
                                  ))}
                                  {importStatus.errors.length > 3 && (
                                    <div>• ... и еще {importStatus.errors.length - 3} предупреждений</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Статус завершения */}
                        {importStatus.status === 'completed' && (
                          <div className="text-center">
                            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                            <p className="text-green-700 font-medium">
                              Импорт завершен успешно! Переходим к настройке области генерации.
                            </p>
                          </div>
                        )}

                        {importStatus.status === 'failed' && (
                          <div className="text-center">
                            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-2" />
                            <p className="text-red-700 font-medium">
                              Ошибка импорта: {importStatus.error}
                            </p>
                            <Button 
                              variant="outline" 
                              className="mt-4"
                              onClick={() => startImportMutation.mutate()}
                            >
                              Повторить импорт
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Кнопки управления */}
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setCurrentStep(2)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Назад к SEO профилю
                    </Button>
                    
                    {/* Показываем кнопку перехода только когда импорт завершен ИЛИ если jobId не установлен */}
                    {(importStatus?.status === 'completed' || !importJobId) && (
                      <Button 
                        onClick={() => setCurrentStep(4)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {!importJobId ? 'Пропустить импорт' : 'Настроить область генерации'}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                    
                    {/* Кнопка повтора импорта при ошибке */}
                    {importStatus?.status === 'failed' && (
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setImportJobId(null);
                          if (csvPreview?.uploadId) {
                            startImportMutation.mutate();
                          }
                        }}
                      >
                        Повторить импорт
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Шаг 4: Настройка области генерации */}
              {currentStep === 4 && (
                <div className="text-center space-y-6">
                  <div className="space-y-4">
                    <Settings className="h-16 w-16 text-blue-600 mx-auto" />
                    <h3 className="text-xl font-semibold text-gray-900">
                      Настройка области генерации
                    </h3>
                    <p className="text-gray-600">
                      Выберите scope для создания внутренних ссылок и запустите генерацию.
                    </p>
                  </div>

                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => setCurrentStep(3)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Назад к импорту
                    </Button>
                    <Button 
                      onClick={() => generateLinksMutation.mutate()}
                      disabled={generateLinksMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {generateLinksMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Запускаем генерацию...
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4 mr-2" />
                          Запустить генерацию ссылок
                        </>
                      )}
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