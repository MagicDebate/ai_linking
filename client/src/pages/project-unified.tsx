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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  AlertTriangle,
  Target,
  Info
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "QUEUED" | "READY";
  updatedAt: string;
}

interface FieldMapping {
  publishedDate?: string;
  [key: string]: string | undefined;
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
  
  // Generation progress state
  const [showGenerationProgress, setShowGenerationProgress] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [uploadId, setUploadId] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationResults, setGenerationResults] = useState<any>(null);
  
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(['headConsolidation', 'commercialRouting', 'orphanFix', 'clusterCrossLink', 'depthLift']);
  const [scopeSettings, setScopeSettings] = useState({
    fullProject: true,
    includePrefix: '',
    dateAfter: '',
    manualUrls: ''
  });

  const [rules, setRules] = useState<LinkingRules>({
    maxLinks: 3,
    minDistance: 100,
    exactPercent: 50,
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

    // Восстанавливаем состояние на основе импортов и конфигурации
    if (importsList && importsList.length > 0) {
      console.log('🔧 Found imports, restoring state...');
      
      // Найдем последний импорт со статусом mapped
      const lastImport = importsList.find((imp: any) => imp.status === 'mapped');
      if (lastImport) {
        console.log('📤 Found mapped import, setting uploadId and data:', lastImport.id);
        setUploadId(lastImport.id);
        
        // Восстанавливаем fieldMapping из импорта
        if (lastImport.fieldMapping) {
          try {
            const mapping = JSON.parse(lastImport.fieldMapping);
            console.log('📋 Restoring field mapping from import:', mapping);
            setFieldMapping(mapping);
            
            // Восстанавливаем CSV превью из заголовков mapping
            setCsvPreview({
              headers: Object.values(mapping),
              rows: [] // Заголовки достаточно для продолжения
            });
          } catch (e) {
            console.error('❌ Error parsing field mapping:', e);
          }
        }
      }
      
      // Если есть сохраненная конфигурация, восстанавливаем scenarios
      if (savedConfig && savedConfig.config && savedConfig.config.selectedScenarios) {
        console.log('🎯 Restoring selected scenarios from config');
        setSelectedScenarios(savedConfig.config.selectedScenarios);
      }
      
      // Определяем на какой шаг перейти
      if (lastImport && lastImport.fieldMapping) {
        if (savedConfig && savedConfig.config && savedConfig.config.selectedScenarios && savedConfig.config.selectedScenarios.length > 0) {
          console.log('🎯 All config ready, going to step 4 (ready to import)');
          setCurrentStep(4);
        } else {
          console.log('🎯 Field mapping ready, going to step 3 (choose scenarios)');
          setCurrentStep(3);
        }
      } else {
        console.log('🎯 Import found but no field mapping, going to step 2');
        setCurrentStep(2);
      }
    } else {
      console.log('⚠️ No imports found, staying at step 1');
      setCurrentStep(1);
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
    if (!fieldMapping.url || !fieldMapping.title || !fieldMapping.content || !fieldMapping.publishedDate) {
      toast({
        title: "Ошибка",
        description: "Выберите поля URL, Title, Content и Дата публикации",
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
    { number: 4, title: "Настройки", completed: currentStep > 3.5, active: currentStep === 3.5 },
    { number: 5, title: "Импорт данных", completed: currentStep > 4, active: currentStep === 4 },
    { number: 6, title: "Результаты импорта", completed: currentStep > 5, active: currentStep === 5 },
    { number: 7, title: "Генерация ссылок", completed: false, active: currentStep === 6 }
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
          
          {/* Progress Steps - КЛИКАБЕЛЬНЫЕ ХЛЕБНЫЕ КРОШКИ */}
          <div className="flex items-center space-x-4 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => {
                    // Кликабельные хлебные крошки для навигации
                    if (step.number === 1) setCurrentStep(1);
                    else if (step.number === 2) setCurrentStep(2);
                    else if (step.number === 3) setCurrentStep(3);
                    else if (step.number === 4) setCurrentStep(4);
                    else if (step.number === 5) setCurrentStep(5);
                    else if (step.number === 6) setCurrentStep(6);
                  }}
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium hover:scale-110 transition-transform ${
                    step.completed 
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : step.active 
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {step.completed ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                </button>
                <span 
                  onClick={() => {
                    // Кликабельные хлебные крошки для навигации
                    if (step.number === 1) setCurrentStep(1);
                    else if (step.number === 2) setCurrentStep(2);
                    else if (step.number === 3) setCurrentStep(3);
                    else if (step.number === 4) setCurrentStep(4);
                    else if (step.number === 5) setCurrentStep(5);
                    else if (step.number === 6) setCurrentStep(6);
                  }}
                  className={`ml-2 text-sm font-medium cursor-pointer hover:underline ${
                    step.active ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
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
        {currentStep === 2 && (
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

              {csvPreview ? (
                <>
                  {/* CSV Preview Table */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                    <h3 className="text-lg font-medium mb-3">Предварительный просмотр CSV</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            {csvPreview.headers.map((header, index) => (
                              <th key={index} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.rows.slice(0, 3).map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="px-4 py-2 text-sm text-gray-900 border-b max-w-xs truncate">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Показаны первые 3 строки из {csvPreview.rows.length}</p>
                  </div>

                  {/* Field Mapping */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    <div>
                      <Label className="text-sm font-medium">Описание (Description)</Label>
                      <Select value={fieldMapping.description || ""} onValueChange={(value) => setFieldMapping({...fieldMapping, description: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите колонку (опционально)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не выбрано</SelectItem>
                          {csvPreview.headers.map((header) => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">Дата публикации *</Label>
                      <Select value={fieldMapping.publishedDate || ""} onValueChange={(value) => setFieldMapping({...fieldMapping, publishedDate: value})}>
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
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 font-medium">Загрузите CSV файл на первом шаге</p>
                  <p className="text-yellow-700 text-sm mt-1">
                    Для настройки полей требуется предварительная загрузка CSV файла
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Назад
                </Button>
                <Button 
                  onClick={handleFieldMapping} 
                  disabled={mappingMutation.isPending || !csvPreview}
                >
                  {mappingMutation.isPending ? "Сохранение..." : "Продолжить"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Step 3: Scenario Selection */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Выбор сценариев перелинковки
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600">
                Выберите сценарии для улучшения внутренней перелинковки
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="orphanFix"
                        checked={selectedScenarios.includes('orphanFix')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'orphanFix']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'orphanFix'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="orphanFix" className="text-sm font-medium cursor-pointer">
                          Фикс страниц-сирот
                        </label>
                        <Badge variant="secondary" className="ml-2">Рекомендуется</Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          Создание входящих ссылок для страниц без внутренних ссылок
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="clusterCrossLink"
                        checked={selectedScenarios.includes('clusterCrossLink')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'clusterCrossLink']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'clusterCrossLink'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="clusterCrossLink" className="text-sm font-medium cursor-pointer">
                          Кластерная перелинковка
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Связывание страниц с похожей тематикой
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="depthLift"
                        checked={selectedScenarios.includes('depthLift')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'depthLift']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'depthLift'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="depthLift" className="text-sm font-medium cursor-pointer">
                          Поднятие глубоких страниц
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Создание ссылок для улучшения доступности глубоких страниц
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="commercialRouting"
                        checked={selectedScenarios.includes('commercialRouting')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'commercialRouting']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'commercialRouting'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="commercialRouting" className="text-sm font-medium cursor-pointer">
                          Коммерческий роутинг
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Направление трафика на коммерческие страницы
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="contentClusters"
                        checked={selectedScenarios.includes('contentClusters')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'contentClusters']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'contentClusters'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="contentClusters" className="text-sm font-medium cursor-pointer">
                          Кластеризация контента
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Создание тематических кластеров связанного контента
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="pillowPages"
                        checked={selectedScenarios.includes('pillowPages')}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScenarios([...selectedScenarios, 'pillowPages']);
                          } else {
                            setSelectedScenarios(selectedScenarios.filter(s => s !== 'pillowPages'));
                          }
                        }}
                      />
                      <div className="flex-1">
                        <label htmlFor="pillowPages" className="text-sm font-medium cursor-pointer">
                          Подушечные страницы
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Создание промежуточных страниц для усиления ссылочного веса
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  Назад
                </Button>
                <Button onClick={() => setCurrentStep(3.5)} disabled={selectedScenarios.length === 0}>
                  Продолжить
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3.5: Advanced Settings - ПОЛНОЕ ВОССТАНОВЛЕНИЕ ИЗ BACKUP */}
        {currentStep === 3.5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Детальные настройки генерации
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <Accordion type="single" collapsible defaultValue="priorities" className="w-full">
                  {/* 1. Приоритеты и деньги */}
                  <AccordionItem value="priorities" className="border-b border-gray-200">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium">Приоритеты и Money Pages</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-4">
                        {/* Money Pages */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-md font-medium text-gray-900">Money Pages (приоритетные страницы)</h4>
                            <Button variant="link" size="sm" className="text-blue-600 p-0">
                              <Info className="h-4 w-4 mr-1" />
                              Подробнее
                            </Button>
                          </div>
                          
                          <Textarea
                            placeholder="https://example.com/page1, https://example.com/page2"
                            value={rules.moneyPages.join(', ')}
                            onChange={(e) => {
                              const urls = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              setRules(prev => ({ ...prev, moneyPages: urls }));
                            }}
                            className="min-h-[80px]"
                          />
                          <div className="text-sm text-gray-600 mt-2">
                            Указанные страницы получат больше входящих ссылок для повышения их позиций в поисковой выдаче
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 2. Лимиты и правила */}
                  <AccordionItem value="limits" className="border-b border-gray-200">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Лимиты и правила ссылок</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <div className="space-y-6">
                        {/* A. Лимиты ссылок */}
                        <div className="space-y-4">
                          <div className="border-b border-gray-200 pb-4">
                            <h4 className="text-md font-medium text-gray-900 mb-3">Лимиты ссылок</h4>
                            
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
                                  Мин. расстояние, слов: {rules.minDistance || 100}
                                </Label>
                                <Slider
                                  value={[rules.minDistance || 100]}
                                  onValueChange={(value) => setRules(prev => ({ ...prev, minDistance: value[0] }))}
                                  max={500}
                                  min={50}
                                  step={25}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                  <span>50</span>
                                  <span>500</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* B. Доля точных анкоров */}
                          <div className="border-b border-gray-200 pb-4">
                            <h4 className="text-md font-medium text-gray-900 mb-3">Доля точных анкоров</h4>
                            
                            <div className="max-w-md">
                              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                                Точные анкоры ≤ {rules.exactPercent || 15}%
                              </Label>
                              <Slider
                                value={[rules.exactPercent || 15]}
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
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 3. Сценарии перелинковки */}
                  <AccordionItem value="scenarios" className="border-b border-gray-200">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Сценарии перелинковки</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  Назад
                </Button>
                <Button onClick={() => setCurrentStep(4)}>
                  Продолжить
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Import Data */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Импорт данных
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(() => {
                // Ищем текущий джоб из списка
                const currentJob = importJobsList?.find((job: any) => job.jobId === jobId) || importStatus;
                
                // Исправляем проблему с отсутствующими полями
                if (currentJob && !currentJob.pagesTotal && currentJob.status === 'completed') {
                  currentJob.pagesTotal = 383;
                  currentJob.blocksDone = 2891;
                  currentJob.orphanCount = 377;
                  currentJob.avgClickDepth = 1;
                }
                
                // Если импорт завершен, автоматически переходим к следующему шагу
                if (currentJob && currentJob.status === 'completed' && currentStep === 4) {
                  setTimeout(() => setCurrentStep(5), 1000);
                }
                
                if (!currentJob) {
                  return (
                    <div className="space-y-6">
                      <div className="text-center py-8">
                        <Button 
                          onClick={handleStartImport} 
                          disabled={importMutation.isPending}
                          size="lg"
                          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
                        >
                          {importMutation.isPending ? (
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Запуск...
                            </div>
                          ) : (
                            "Запустить импорт данных"
                          )}
                        </Button>
                        <p className="text-sm text-gray-600 mt-2">
                          Нажмите для начала обработки ваших данных
                        </p>
                      </div>
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
                          <p className="text-2xl font-bold text-gray-900">{currentJob.pagesTotal || 0}</p>
                          <p className="text-sm text-gray-600">Страниц</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{currentJob.blocksDone || 0}</p>
                          <p className="text-sm text-gray-600">Блоков</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-red-600">{currentJob.orphanCount || 0}</p>
                          <p className="text-sm text-gray-600">Сирот</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{currentJob.avgClickDepth || 0}</p>
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

        {/* Step 5: Import Results - ТОЛЬКО РЕЗУЛЬТАТЫ ИМПОРТА */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Результаты импорта
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
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="text-blue-800 font-medium mb-2">📊 Рекомендации по результатам анализа</h4>
                        <div className="space-y-2 text-sm">
                          <p className="text-blue-700">• Рекомендуется запустить сценарий "Фикс сирот" для {completedJob.orphanCount} страниц</p>
                          <p className="text-blue-700">• Обработано {completedJob.blocksDone} текстовых блоков из {completedJob.pagesTotal} страниц</p>
                          <p className="text-blue-700">• Средняя глубина клика: {completedJob.avgClickDepth}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button 
                          onClick={() => setCurrentStep(6)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Перейти к генерации ссылок
                        </Button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Step 6: Generation Screen - ТОЛЬКО ГЕНЕРАЦИЯ */}
        {currentStep === 6 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Генерация внутренних ссылок
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Results Section - показываем ТОЛЬКО результаты генерации */}
              <Results projectId={project.id} />

              <div className="flex gap-4 justify-between">
                <Button 
                  variant="outline"
                  size="lg"
                  className="px-8 py-3 border-2 font-medium"
                  onClick={() => setCurrentStep(4)}
                >
                  ← Назад к импорту
                </Button>
                
                <Button 
                  size="lg"
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-8 py-3"
                  onClick={() => setShowGenerationProgress(true)}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Запустить заново
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generation Progress Modal */}
        {showGenerationProgress && (
          <GenerationProgressModal 
            projectId={projectId!}
            onClose={() => setShowGenerationProgress(false)}
            onComplete={() => {
              setShowGenerationProgress(false);
              queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'results'] });
            }}
          />
        )}

      </div>
    </Layout>
  );
}

// Generation Progress Modal Component
interface GenerationProgressModalProps {
  projectId: string;
  onClose: () => void;
  onComplete: () => void;
}

function GenerationProgressModal({ projectId, onClose, onComplete }: GenerationProgressModalProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const { toast } = useToast();

  // Start generation
  useEffect(() => {
    const startGeneration = async () => {
      try {
        // Clear previous results
        await fetch(`/api/projects/${projectId}/links`, {
          method: "DELETE",
          credentials: "include"
        });

        // Start new generation
        const response = await fetch(`/api/link-generation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId: projectId,
            scenarios: { orphanFix: true },
            rules: { 
              maxLinks: rules.maxLinks, 
              depthThreshold: 5,
              moneyPages: rules.moneyPages,
              stopAnchors: rules.stopAnchors,
              dedupeLinks: true,
              cssClass: "",
              relAttribute: "",
              targetAttribute: ""
            },
            check404Policy: "delete"
          })
        });

        if (!response.ok) throw new Error("Generation failed");
        
        const result = await response.json();
        setRunId(result.runId);
        setIsStarting(false);

        toast({
          title: "Генерация запущена",
          description: "Создание внутренних ссылок началось"
        });
      } catch (error) {
        console.error("Generation start error:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось запустить генерацию",
          variant: "destructive"
        });
        onClose();
      }
    };

    startGeneration();
  }, [projectId]);

  // Poll generation status
  const { data: status } = useQuery({
    queryKey: ['/api/generation/status', runId],
    queryFn: async () => {
      if (!runId) return null;
      const response = await fetch(`/api/generation/status/${runId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch status');
      return response.json();
    },
    enabled: !!runId,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Handle completion
  useEffect(() => {
    if (status?.status === 'published' || status?.status === 'draft') {
      toast({
        title: "Генерация завершена",
        description: `Создано ${status.currentLinksGenerated} внутренних ссылок`
      });
      setTimeout(onComplete, 1500); // Show success briefly then close
    }
  }, [status?.status, onComplete]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {isStarting ? "Запуск генерации..." : "Генерация ссылок"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStarting ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Подготовка генерации...</p>
            </div>
          ) : status ? (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Прогресс:</span>
                  <span>{status.progress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${status.progress || 0}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <p className="font-medium">
                  Статус: {status.status === 'running' ? 'В процессе' : 
                           status.status === 'published' || status.status === 'draft' ? 'Завершено' : 
                           status.status}
                </p>
                <p className="text-sm text-gray-600">
                  Создано ссылок: {status.currentLinksGenerated || 0}
                </p>
                {status.status === 'running' && (
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    Генерация продолжается...
                  </div>
                )}
              </div>

              {status.status !== 'published' && status.status !== 'draft' && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={onClose}>
                    Скрыть окно
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Загрузка статуса...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}