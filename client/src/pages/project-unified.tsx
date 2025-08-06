import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Results } from "@/components/Results";
import { LinksTable } from "@/components/LinksTable";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { HelpDialog } from "@/components/HelpDialog";
import {
  Upload,
  FileText,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Settings,
  Link as LinkIcon,
  Play,
  RefreshCw,
  Star,
  Network,
  DollarSign,
  LifeBuoy,
  ChevronDown,
  Clock,
  Database,
  Zap,
  ExternalLink,
  RotateCcw,
  Search,
  AlertTriangle
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "QUEUED" | "READY";
  updatedAt: string;
}

interface FieldMapping {
  [key: string]: string;
}

interface CsvPreview {
  headers: string[];
  rows: string[][];
}

interface ImportStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  phase: string;
  percent: number;
  pagesTotal: number;
  pagesDone: number;
  blocksDone: number;
  orphanCount: number;
  avgClickDepth: number;
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

const PHASE_LABELS: Record<string, string> = {
  loading: "Загрузка страниц",
  cleaning: "Очистка контента", 
  chunking: "Разбивка на блоки",
  extracting: "Извлечение данных",
  vectorizing: "Генерация эмбеддингов",
  graphing: "Построение графа связей",
  finalizing: "Финализация"
};

export default function UnifiedProjectPage() {
  const [, params] = useRoute("/project/:id");
  const [location] = useLocation();
  const projectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [uploadId, setUploadId] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['orphanFix']);
  const [scopeSettings, setScopeSettings] = useState({
    fullProject: true,
    includePrefix: '',
    dateAfter: '',
    manualUrls: ''
  });

  const [rules, setRules] = useState<LinkingRules>({
    maxLinks: 2,
    minDistance: 150,
    exactPercent: 15,
    scenarios: {
      headConsolidation: false,
      clusterCrossLink: false,
      commercialRouting: false,
      orphanFix: true,
      depthLift: false,
    },
    depthThreshold: 5,
    oldLinksPolicy: 'enrich',
    dedupeLinks: true,
    brokenLinksPolicy: 'delete',
    stopAnchors: ['читать далее', 'подробнее', 'здесь', 'жмите сюда', 'click here', 'learn more'],
    moneyPages: [],
    freshnessPush: false,
    freshnessThreshold: 30,
    freshnessLinks: 1,
  });

  // Get project data
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Check import status to determine correct step
  const { data: importJobsList } = useQuery({
    queryKey: ['/api/import', projectId, 'jobs'],
    queryFn: async () => {
      console.log('🔍 Fetching import jobs for projectId:', projectId);
      const response = await fetch(`/api/import/${projectId}/jobs`, {
        credentials: 'include'
      });
      if (!response.ok) {
        console.error('❌ Import jobs fetch failed:', response.status);
        return [];
      }
      const data = await response.json();
      console.log('📋 Import jobs received:', data);
      return data;
    },
    enabled: !!projectId,
    refetchInterval: 5000, // Check for new jobs every 5 seconds
  });

  // Get saved configuration to restore state
  const { data: savedConfig } = useQuery({
    queryKey: ['/api/projects', projectId, 'config', 'load'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/config/load`, {
        credentials: 'include'
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!projectId
  });

  // Get import details to check if we have uploaded files
  const { data: importsList } = useQuery({
    queryKey: ['/api/imports', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/imports?projectId=${projectId}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!projectId
  });

  // Auto-determine correct step based on URL, import status and saved config
  useEffect(() => {
    console.log('🔄 State restoration effect triggered');
    console.log('📊 savedConfig:', savedConfig);
    console.log('📊 importsList:', importsList);
    console.log('📊 importJobsList:', importJobsList);
    
    // Если это URL генерации ссылок - переходим к генерации
    if (location.includes('/generate')) {
      console.log('🎯 URL contains /generate, going to step 5');
      setCurrentStep(5);
      return;
    }

    // Проверяем активные джобы из списка
    if (importJobsList && importJobsList.length > 0) {
      const runningJob = importJobsList.find((job: any) => job.status === 'running');
      if (runningJob && !jobId) {
        console.log('🔧 Found running job, setting jobId:', runningJob.jobId);
        setJobId(runningJob.jobId);
        setCurrentStep(4);
        return;
      }
    }

    // Проверяем завершенные импорты
    if (importJobsList && importJobsList.length > 0) {
      const lastJob = importJobsList[0];
      if (lastJob.status === 'completed') {
        console.log('✅ Found completed import job, going to step 5');
        setCurrentStep(5);
        return;
      } else if (lastJob.status === 'running') {
        console.log('🔄 Found running import job, going to step 4');
        setJobId(lastJob.jobId);
        setCurrentStep(4);
        return;
      }
    }

    // Восстанавливаем состояние на основе сохраненных данных
    if (savedConfig) {
      console.log('🔧 Found saved config, restoring state...');
      console.log('📁 Config field mapping:', savedConfig.fieldMapping);
      console.log('🎛️ Config scenarios:', savedConfig.selectedScenarios);
      
      // Восстанавливаем данные из сохраненной конфигурации
      if (savedConfig.fieldMapping && Object.keys(savedConfig.fieldMapping).length > 0) {
        console.log('📋 Restoring field mapping and CSV preview');
        setCsvPreview({
          headers: Object.values(savedConfig.fieldMapping),
          rows: [] // Заголовки достаточно для продолжения
        });
        setFieldMapping(savedConfig.fieldMapping);
      }
      
      if (savedConfig.selectedScenarios && savedConfig.selectedScenarios.length > 0) {
        console.log('🎯 Restoring selected scenarios');
        setSelectedScenarios(savedConfig.selectedScenarios);
      }
      
      // Если есть список импортов, найдем последний
      if (importsList && importsList.length > 0) {
        const lastImport = importsList.find((imp: any) => imp.status === 'mapped' || imp.status === 'uploaded');
        if (lastImport) {
          console.log('📤 Found import, setting uploadId:', lastImport.id);
          setUploadId(lastImport.id);
        }
      }
      
      // Определяем на какой шаг перейти
      if (savedConfig.fieldMapping && Object.keys(savedConfig.fieldMapping).length > 0) {
        if (savedConfig.selectedScenarios && savedConfig.selectedScenarios.length > 0) {
          console.log('🎯 All config ready, going to step 3 (ready to import)');
          setCurrentStep(3);
        } else {
          console.log('🎯 Field mapping ready, going to step 3 (choose scenarios)');
          setCurrentStep(3);
        }
      } else {
        console.log('🎯 Config found but no field mapping, going to step 2');
        setCurrentStep(2);
      }
    } else {
      console.log('⚠️ No saved config found, staying at step 1');
    }
  }, [importJobsList, location, savedConfig, importsList]);

  // Get import status for active job
  const { data: importStatus } = useQuery<ImportStatus>({
    queryKey: ['/api/import/status', jobId],
    queryFn: async () => {
      console.log('🔄 Fetching import status for jobId:', jobId);
      const response = await fetch('/api/import/status?' + new URLSearchParams({ 
        projectId: projectId!, 
        jobId: jobId! 
      }).toString(), {
        credentials: 'include'
      });
      if (!response.ok) {
        console.error('❌ Status fetch failed:', response.status);
        return null;
      }
      const data = await response.json();
      console.log('📊 Status data received:', data);
      return data;
    },
    enabled: !!projectId && !!jobId && currentStep === 4,
    refetchInterval: (data) => {
      // Keep polling if status is running, stop if completed/failed  
      if (data && 'status' in data && data.status === 'running') {
        console.log('🔄 Import running, continuing to poll...');
        return 2000;
      }
      console.log('⏹️ Import finished, stopping poll');
      return false;
    },
  });

  // Автоматический переход к генерации когда импорт завершен
  useEffect(() => {
    // Проверяем из importJobsList если importStatus недоступен
    if (currentStep === 4 && importJobsList && importJobsList.length > 0) {
      const completedJob = importJobsList.find((job: any) => job.status === 'completed');
      if (completedJob) {
        console.log('✅ Import completed (from jobsList), transitioning to step 5');
        setCurrentStep(5);
        toast({
          title: "Импорт завершен",
          description: "Переходим к генерации ссылок",
        });
        return;
      }
    }
    
    // Fallback - проверяем importStatus
    if (importStatus?.status === 'completed' && currentStep === 4) {
      console.log('✅ Import completed (from status), transitioning to step 5');
      setCurrentStep(5);
      toast({
        title: "Импорт завершен",
        description: "Переходим к генерации ссылок",
      });
    }
  }, [importStatus?.status, currentStep, importJobsList]);

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
        description: "Настройте соответствие полей",
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
        credentials: "include",
        body: JSON.stringify({
          uploadId,
          fieldMapping: mapping,
          projectId,
        }),
      });

      if (!response.ok) {
        throw new Error("Mapping failed");
      }

      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(3);
      toast({
        title: "Поля настроены",
        description: "Выберите сценарии перелинковки",
      });
    },
  });

  // Import mutation (Step 4)
  const importMutation = useMutation({
    mutationFn: async () => {
      console.log('📡 Making API call to /api/import/start');
      const response = await fetch("/api/import/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          importId: uploadId,
          scenarios: selectedScenarios,
          scope: scopeSettings,
          rules
        }),
      });

      console.log('📡 API response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ API error:', errorData);
        throw new Error(errorData.error || "Import failed");
      }

      const result = await response.json();
      console.log('✅ API success:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('✅ Import mutation success, setting jobId:', data.jobId);
      setJobId(data.jobId);
      setCurrentStep(4);
      toast({
        title: "Импорт запущен",
        description: "Обрабатываем ваши данные",
      });
    },
    onError: (error) => {
      console.error('❌ Import mutation error:', error);
      toast({
        title: "Ошибка импорта",
        description: error instanceof Error ? error.message : "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      uploadMutation.mutate(file);
    }
  };

  const handleFieldMapping = () => {
    if (!fieldMapping.url || !fieldMapping.title || !fieldMapping.content) {
      toast({
        title: "Ошибка",
        description: "Выберите поля URL, Title и Content",
        variant: "destructive",
      });
      return;
    }
    mappingMutation.mutate(fieldMapping);
  };

  const handleStartImport = () => {
    console.log('🚀 Starting import with:');
    console.log('📁 projectId:', projectId);
    console.log('📤 uploadId:', uploadId);
    console.log('🎯 selectedScenarios:', selectedScenarios);
    console.log('⚙️ scopeSettings:', scopeSettings);
    console.log('📜 rules:', rules);
    
    if (selectedScenarios.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите хотя бы один сценарий",
        variant: "destructive",
      });
      return;
    }
    
    if (!uploadId) {
      toast({
        title: "Ошибка", 
        description: "Нет загруженного файла для импорта",
        variant: "destructive",
      });
      return;
    }
    
    importMutation.mutate();
  };

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertCircle className="h-16 w-16 text-red-600 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">Проект не найден</h2>
        </div>
      </div>
    );
  }

  const steps = [
    { number: 1, title: "Загрузка данных", completed: currentStep > 1, active: currentStep === 1 },
    { number: 2, title: "Настройка полей", completed: currentStep > 2, active: currentStep === 2 },
    { number: 3, title: "Выбор сценариев", completed: currentStep > 3, active: currentStep === 3 },
    { number: 4, title: "Импорт данных", completed: currentStep > 4, active: currentStep === 4 },
    { number: 5, title: "Генерация ссылок", completed: false, active: currentStep === 5 }
  ];

  return (
    <Layout title={project.name}>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Project Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-gray-600">{project.domain}</p>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center space-x-4 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-shrink-0">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step.completed 
                    ? 'bg-green-500 text-white'
                    : step.active 
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step.completed ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-gray-400 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: File Upload */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Загрузка CSV файла
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600">
                Загрузите CSV файл с данными вашего сайта для анализа
              </p>
              
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Выберите CSV файл
                </h3>
                <p className="text-gray-600 mb-4">
                  Или перетащите файл сюда
                </p>
                <Button disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? "Загрузка..." : "Выбрать файл"}
                </Button>
              </div>

              {uploadedFile && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-900">{uploadedFile.name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Field Mapping */}
        {currentStep === 2 && csvPreview && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Настройка соответствия полей
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600">
                Укажите, какие колонки CSV соответствуют полям сайта
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">URL страницы *</Label>
                  <Select value={fieldMapping.url || ""} onValueChange={(value) => setFieldMapping({...fieldMapping, url: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите колонку" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvPreview.headers.map((header) => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Заголовок (Title) *</Label>
                  <Select value={fieldMapping.title || ""} onValueChange={(value) => setFieldMapping({...fieldMapping, title: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите колонку" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvPreview.headers.map((header) => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Контент *</Label>
                  <Select value={fieldMapping.content || ""} onValueChange={(value) => setFieldMapping({...fieldMapping, content: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите колонку" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvPreview.headers.map((header) => (
                        <SelectItem key={header} value={header}>{header}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Назад
                </Button>
                <Button onClick={handleFieldMapping} disabled={mappingMutation.isPending}>
                  {mappingMutation.isPending ? "Сохранение..." : "Продолжить"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Scenarios */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Генерация внутренних ссылок
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 font-medium">🎯 Готов к генерации</p>
                <p className="text-blue-700 text-sm mt-1">
                  Будет обработано {completedJob?.orphanCount || 0} страниц-сирот с применением сценария фикса сирот
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Запустить генерацию ссылок</h3>
                
                <div className="flex gap-4 items-center">
                  <Button 
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white font-medium px-8 py-3"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        "Вы уверены? Текущие результаты генерации будут удалены и заменены новыми."
                      );
                      
                      if (!confirmed) return;
                      
                      try {
                        // Сначала очищаем предыдущие результаты
                        await fetch(`/api/projects/${projectId}/links`, {
                          method: "DELETE",
                          credentials: "include"
                        });

                        const response = await fetch(`/api/projects/${projectId}/generate-links`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          credentials: "include",
                          body: JSON.stringify({
                            projectId: projectId,
                            scenarios: { orphanFix: true },
                            rules: { 
                              maxLinks: 3, 
                              depthThreshold: 5,
                              moneyPages: [],
                              stopAnchors: ["читать далее", "подробнее"],
                              dedupeLinks: true,
                              cssClass: "",
                              relAttribute: "",
                              targetAttribute: ""
                            },
                            check404Policy: "delete"
                          }),
                        });

                        if (!response.ok) {
                          throw new Error("Failed to start generation");
                        }

                        toast({
                          title: "Новая генерация запущена",
                          description: "Предыдущие результаты очищены, создание новых ссылок началось"
                        });
                        
                        // Переходим на шаг 6 для отслеживания прогресса
                        setCurrentStep(6);
                      } catch (error) {
                        console.error("Generation start error:", error);
                        toast({
                          title: "Ошибка",
                          description: "Не удалось запустить генерацию ссылок"
                        });
                      }
                    }}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Запустить генерацию
                  </Button>
                  
                  <Button 
                    variant="outline"
                    size="lg"
                    className="px-8 py-3 border-2 font-medium"
                    onClick={() => {
                      // Очищаем результаты генерации при переходе назад
                      setGenerationResults(null);
                      setCurrentStep(5);
                    }}
                  >
                    ← Назад
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Import Progress */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Импорт и обработка данных
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                // Ищем текущий джоб из списка
                const currentJob = importJobsList?.find((job: any) => job.jobId === jobId) || importStatus;
                
                if (!currentJob) {
                  return (
                    <div className="text-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                      <p>Запуск импорта...</p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{PHASE_LABELS[currentJob.phase] || currentJob.phase}</p>
                        <p className="text-sm text-gray-600">
                          {currentJob.status === 'completed' ? 'Импорт завершен' : 
                           currentJob.status === 'failed' ? `Ошибка: ${currentJob.errorMessage || 'Неизвестная ошибка'}` :
                           `${currentJob.percent}% выполнено`}
                        </p>
                      </div>
                      {currentJob.status === 'running' && (
                        <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                      )}
                      {currentJob.status === 'failed' && (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    
                    <Progress value={currentJob.percent} className="w-full" />
                    
                    {currentJob.status === 'completed' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{currentJob.pagesTotal}</p>
                          <p className="text-sm text-gray-600">Страниц</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{currentJob.blocksDone}</p>
                          <p className="text-sm text-gray-600">Блоков</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-red-600">{currentJob.orphanCount}</p>
                          <p className="text-sm text-gray-600">Сирот</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{currentJob.avgClickDepth}</p>
                          <p className="text-sm text-gray-600">Глубина</p>
                        </div>
                      </div>
                    )}
                    
                    {currentJob.status === 'completed' && (
                      <div className="flex justify-end">
                        <Button onClick={() => setCurrentStep(5)}>
                          <Zap className="h-4 w-4 mr-2" />
                          Генерировать ссылки
                        </Button>
                      </div>
                    )}
                    
                    {currentJob.status === 'failed' && (
                      <div className="flex justify-end">
                        <Button onClick={() => setCurrentStep(3)} variant="outline">
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Запустить заново
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Step 5: Link Generation */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Генерация внутренних ссылок
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                // Получаем данные завершенного импорта
                const completedJob = importJobsList?.find((job: any) => job.status === 'completed');
                
                return (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mr-3" />
                        <div>
                          <p className="font-medium text-green-900">Импорт завершен успешно</p>
                          <p className="text-sm text-green-700">Все данные обработаны и готовы для генерации ссылок</p>
                        </div>
                      </div>
                      
                      {completedJob && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div className="text-center p-3 bg-white rounded-lg">
                            <p className="text-2xl font-bold text-gray-900">{completedJob.pagesTotal}</p>
                            <p className="text-sm text-gray-600">Страниц импортировано</p>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">{completedJob.blocksDone}</p>
                            <p className="text-sm text-gray-600">Блоков контента</p>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <p className="text-2xl font-bold text-red-600">{completedJob.orphanCount}</p>
                            <p className="text-sm text-gray-600">Страниц-сирот</p>
                          </div>
                          <div className="text-center p-3 bg-white rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{completedJob.avgClickDepth}</p>
                            <p className="text-sm text-gray-600">Средняя глубина</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Импорт завершен успешно</h3>
                      
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <p className="text-green-800 font-medium">✅ Данные успешно импортированы</p>
                        <p className="text-green-700 text-sm mt-1">
                          Найдено {completedJob.orphanCount} страниц-сирот для генерации ссылок
                        </p>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <h4 className="text-blue-800 font-medium mb-2">📊 Рекомендации по результатам анализа</h4>
                        <div className="space-y-2 text-sm">
                          <p className="text-blue-700">• Рекомендуется запустить сценарий "Фикс сирот" для {completedJob.orphanCount} страниц</p>
                          <p className="text-blue-700">• Обработано {completedJob.blocksDone} текстовых блоков из {completedJob.pagesTotal} страниц</p>
                          <p className="text-blue-700">• Средняя глубина клика: {completedJob.avgClickDepth}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button 
                          size="lg" 
                          className="h-auto p-4 flex flex-col items-start text-left bg-green-600 hover:bg-green-700"
                          onClick={() => setCurrentStep(3)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="h-5 w-5" />
                            <span className="font-medium">Перейти к генерации</span>
                          </div>
                          <p className="text-sm opacity-80">
                            Настроить и запустить создание внутренних ссылок
                          </p>
                        </Button>
                        
                        <Button 
                          variant="outline"
                          size="lg"
                          className="h-auto p-4 flex flex-col items-start text-left"
                          asChild
                        >
                          <a href={`/project/${projectId}/debug`}>
                            <div className="flex items-center gap-2 mb-2">
                              <ExternalLink className="h-5 w-5" />
                              <span className="font-medium">Просмотр данных</span>
                            </div>
                            <p className="text-sm opacity-80">
                              Изучить импортированные страницы и структуру сайта
                            </p>
                          </a>
                        </Button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start">
                        <AlertTriangle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
                        <div>
                          <p className="font-medium text-blue-900 mb-1">Рекомендации по результатам анализа:</p>
                          <ul className="text-sm text-blue-800 space-y-1">
                            {completedJob?.orphanCount > 0 && (
                              <li>• Найдено {completedJob.orphanCount} страниц-сирот - рекомендуется создать входящие ссылки</li>
                            )}
                            <li>• Средняя глубина страниц: {completedJob?.avgClickDepth || 1} клик от главной</li>
                            <li>• Готово {completedJob?.blocksDone || 0} векторизованных блоков для поиска семантических связей</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-start mt-6">
                      <Button 
                        variant="outline"
                        size="lg"
                        className="px-8 py-3 border-2 font-medium"
                        onClick={() => setCurrentStep(2)}
                      >
                        ← Назад
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Step 6: Generation Progress */}
        {currentStep === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Генерация ссылок
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <RefreshCw className="h-5 w-5 text-blue-600 mr-3 animate-spin" />
                  <div>
                    <p className="font-medium text-blue-900">Генерация в процессе</p>
                    <p className="text-sm text-blue-700">Создаем внутренние ссылки на основе ваших настроек...</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Анализ страниц...</span>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                </div>
                
                <Progress value={25} className="w-full" />
                
                <p className="text-sm text-gray-600">
                  Этот процесс может занять несколько минут в зависимости от количества страниц.
                </p>
              </div>

              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentStep(5)}
                >
                  Назад к результатам
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentStep(3)}
                >
                  Изменить настройки
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        <Results projectId={project.id} />
        
        {/* Generation Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Управление генерацией
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Запустите новую генерацию ссылок с теми же настройками
            </p>
            
            <div className="flex gap-3">
              <Button 
                onClick={async () => {
                  const confirmed = window.confirm(
                    "Вы уверены? Текущие результаты генерации будут удалены и заменены новыми."
                  );
                  
                  if (!confirmed) return;
                  
                  try {
                    // Сначала очищаем предыдущие результаты
                    await fetch(`/api/projects/${project.id}/links`, {
                      method: "DELETE",
                      credentials: "include"
                    });

                    const response = await fetch(`/api/projects/${project.id}/generate-links`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      credentials: "include",
                      body: JSON.stringify({
                        projectId: project.id,
                        scenarios: { orphanFix: true },
                        rules: { 
                          maxLinks: 3, 
                          depthThreshold: 5,
                          moneyPages: [],
                          stopAnchors: ["читать далее", "подробнее"],
                          dedupeLinks: true,
                          cssClass: "",
                          relAttribute: "",
                          targetAttribute: ""
                        },
                        check404Policy: "delete"
                      }),
                    });

                    if (!response.ok) {
                      throw new Error("Failed to start generation");
                    }

                    toast({
                      title: "Новая генерация запущена",
                      description: "Предыдущие результаты очищены, создание новых ссылок началось"
                    });
                  } catch (error) {
                    console.error("Generation start error:", error);
                    toast({
                      title: "Ошибка",
                      description: "Не удалось запустить генерацию ссылок"
                    });
                  }
                }}
                disabled={false}
                className="bg-green-600 hover:bg-green-700"
              >
                <Zap className="mr-2 h-4 w-4" />
                Запустить новую генерацию
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => setCurrentStep(3)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Изменить настройки
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}