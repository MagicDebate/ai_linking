import { useState, useRef } from "react";
import { useRoute } from "wouter";
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
import { useToast } from "@/hooks/use-toast";
import { HelpDialog } from "@/components/HelpDialog";
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
  Play,
  RefreshCw,
  Star,
  DollarSign,
  LifeBuoy,
  Network,
  ChevronDown
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
  cssClass?: string;
  showAdvancedHtml?: boolean;
  relAttributes?: {
    noopener: boolean;
    noreferrer: boolean;
    nofollow: boolean;
  };
  targetBlank?: boolean;
  existingClassPolicy?: 'add' | 'replace';
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
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [scopeSettings, setScopeSettings] = useState({
    fullProject: true,
    includePrefix: '',
    dateAfter: '',
    manualUrls: ''
  });

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [maxLinks, setMaxLinks] = useState(5);
  const [minDistance, setMinDistance] = useState(150);
  const [exactPercent, setExactPercent] = useState(20);
  const [freshnessPush, setFreshnessPush] = useState(false);
  const [oldLinksPolicy, setOldLinksPolicy] = useState<'enrich' | 'regenerate' | 'audit'>('enrich');
  const [scenarios, setScenarios] = useState({
    headConsolidation: false,
    clusterCrossLink: false,
    commercialRouting: false,
    orphanFix: false,
    depthLift: false
  });

  // Auto-configure parameters based on selected scenarios
  const updateParametersForScenarios = (selectedScenarios: any) => {
    // Enable Freshness Push for fast indexing
    const hasFreshnessScenarios = Object.entries(selectedScenarios).some(([key, active]) => 
      active && key === 'headConsolidation' // Fast indexing equivalent
    );
    
    if (hasFreshnessScenarios) {
      setRules(prev => ({ ...prev, freshnessPush: true }));
    }
    const presets = {
      headConsolidation: { maxLinks: 5, minDistance: 200, exactPercent: 20, freshnessPush: false }, // Усилить гайд
      clusterCrossLink: { maxLinks: 3, minDistance: 150, exactPercent: 20, freshnessPush: false }, // Кросс-линк
      commercialRouting: { maxLinks: 4, minDistance: 250, exactPercent: 15, freshnessPush: false }, // Трафик → money
      orphanFix: { maxLinks: 2, minDistance: 150, exactPercent: 15, freshnessPush: false }, // Сироты+deep
      depthLift: { maxLinks: 2, minDistance: 150, exactPercent: 15, freshnessPush: false } // Сироты+deep
    };

    // Get active scenarios
    const activeScenarios = Object.entries(selectedScenarios)
      .filter(([_, active]) => active)
      .map(([name, _]) => name);

    if (activeScenarios.length === 0) {
      // Default if no scenarios selected
      setRules(prev => ({
        ...prev,
        maxLinks: 5,
        minDistance: 150,
        exactPercent: 20,
        freshnessPush: false
      }));
      return;
    }

    // Special case: if only freshness needed (no scenarios selected but freshness push)
    if (activeScenarios.length === 0 && freshnessPush) {
      setRules(prev => ({
        ...prev,
        maxLinks: 3,
        minDistance: 200,
        exactPercent: 10,
        freshnessPush: true
      }));
      return;
    }

    // Calculate minimum values for multiple scenarios
    const configs = activeScenarios.map(scenario => presets[scenario as keyof typeof presets]).filter(Boolean);
    
    if (configs.length > 0) {
      const minConfig = {
        maxLinks: Math.min(...configs.map(c => c.maxLinks)),
        minDistance: Math.min(...configs.map(c => c.minDistance)),
        exactPercent: Math.min(...configs.map(c => c.exactPercent)),
        freshnessPush: configs.some(c => c.freshnessPush)
      };

      setRules(prev => ({
        ...prev,
        ...minConfig
      }));
    }
  };

  const [rules, setRules] = useState<LinkingRules>({
    maxLinks: 5,
    minDistance: 100,
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
    cssClass: '',
    showAdvancedHtml: false,
    relAttributes: {
      noopener: true,
      noreferrer: true,
      nofollow: false
    },
    targetBlank: false,
    existingClassPolicy: 'add'
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
    onError: (error: any) => {
      const errorMessage = error.response?.data?.details || error.response?.data?.message || error.message;
      toast({
        title: "Ошибка загрузки",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Field mapping mutation
  const mappingMutation = useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      const payload = {
        uploadId,
        fieldMapping: mapping,
        projectId,
      };
      console.log('Sending payload:', payload);
      
      const response = await fetch("/api/field-mapping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Mapping failed");
      }

      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(3);
      toast({
        title: "Сопоставление сохранено",
        description: "Переходим к настройке сценариев",
      });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.details || error.response?.data?.message || error.message;
      toast({
        title: "Ошибка сопоставления",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Generate mutation - starts Step 4 import process
  const generateMutation = useMutation({
    mutationFn: async () => {
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

      if (!response.ok) {
        throw new Error("Import start failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log('Import started successfully:', data);
      console.log('JobId from response:', data.jobId);
      
      if (!data.jobId) {
        console.error('❌ No jobId received from server!', data);
        toast({
          title: "Ошибка импорта",
          description: "Сервер не вернул ID задачи",
          variant: "destructive",
        });
        return;
      }
      
      // Redirect to import monitoring page using existing route
      window.location.href = `/project/${projectId}/import?jobId=${data.jobId}`;
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.details || error.response?.data?.message || error.message;
      toast({
        title: "Ошибка запуска импорта",
        description: errorMessage,
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

  const handleMappingSubmit = () => {
    console.log('Submitting field mapping:', { uploadId, fieldMapping });
    mappingMutation.mutate(fieldMapping);
  };

  const handleGenerate = () => {
    generateMutation.mutate();
  };

  const toggleScenario = (scenario: string) => {
    const newSelectedScenarios = selectedScenarios.includes(scenario)
      ? selectedScenarios.filter(s => s !== scenario)
      : [...selectedScenarios, scenario];
    
    setSelectedScenarios(newSelectedScenarios);
    
    // Update rules.scenarios based on selected scenarios
    const newScenariosState = {
      headConsolidation: newSelectedScenarios.includes("headConsolidation"),
      clusterCrossLink: newSelectedScenarios.includes("clusterCrossLink"),
      commercialRouting: newSelectedScenarios.includes("commercialRouting"),
      orphanFix: newSelectedScenarios.includes("orphanFix"),
      depthLift: newSelectedScenarios.includes("depthLift")
    };
    
    setRules(prev => ({
      ...prev,
      scenarios: newScenariosState
    }));
    
    // Auto-configure parameters
    updateParametersForScenarios(newScenariosState);
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
          <p className="text-gray-600">Проверьте правильность ссылки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="flex-1 flex">
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {project.name}
                </h1>
                <p className="text-gray-600">{project.domain}</p>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-500">
                  Статус: {project.status === "READY" ? "Готов" : "В очереди"}
                </span>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Шаг {currentStep} из 5</span>
                <span>{Math.round((currentStep / 5) * 100)}%</span>
              </div>
              <Progress value={(currentStep / 5) * 100} className="h-2" />
            </div>

            {/* Step 1: File Upload */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    1️⃣ Загрузка данных
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-gray-600">
                      Загрузите CSV файл с данными вашего сайта для анализа и создания внутренних ссылок
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
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Field Mapping */}
            {currentStep === 2 && csvPreview && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    2️⃣ Сопоставление полей
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <p className="text-gray-600">
                    Укажите, какие колонки соответствуют нужным полям
                  </p>

                  <div className="space-y-6">
                    {csvPreview && (
                      <div className="space-y-4">
                        <h3 className="font-medium text-gray-900">Превью данных</h3>
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto max-h-96">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-gray-900 w-12">#</th>
                                  {csvPreview.headers.map((header, index) => (
                                    <th key={index} className="px-3 py-2 text-left font-medium text-gray-900 min-w-[120px]">
                                      {header}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {csvPreview.rows.slice(0, 5).map((row, rowIndex) => (
                                  <tr key={rowIndex} className="border-t">
                                    <td className="px-3 py-2 text-sm text-gray-500 w-12 font-mono">{rowIndex + 1}</td>
                                    {csvPreview.headers.map((header, cellIndex) => (
                                      <td key={cellIndex} className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                                        {row[cellIndex] || "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">Сопоставление полей</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {["url", "title", "content", "h1", "description", "pageType", "publishDate"].map((field) => (
                          <div key={field}>
                            <Label className="text-sm font-medium capitalize">
                              {field === "url" ? "URL страницы *" : 
                               field === "title" ? "Заголовок (Title) *" :
                               field === "content" ? "Содержимое *" :
                               field === "h1" ? "Заголовок H1" : 
                               field === "description" ? "Описание *" :
                               field === "pageType" ? "Тип страницы (опционально)" :
                               field === "publishDate" ? "Дата публикации (опционально)" : field}
                            </Label>
                            <Select
                              value={fieldMapping[field] || (["pageType", "publishDate"].includes(field) ? "__none__" : "")}
                              onValueChange={(value) => {
                                const actualValue = value === "__none__" ? "" : value;
                                setFieldMapping(prev => ({ ...prev, [field]: actualValue }));
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={["pageType", "publishDate"].includes(field) ? "Не выбрано" : "Выберите колонку"} />
                              </SelectTrigger>
                              <SelectContent>
                                {["pageType", "publishDate"].includes(field) && (
                                  <SelectItem value="__none__">Не сопоставлять</SelectItem>
                                )}
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
                      onClick={handleMappingSubmit}
                      disabled={mappingMutation.isPending || !fieldMapping.url || !fieldMapping.title || !fieldMapping.content || !fieldMapping.description}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {mappingMutation.isPending ? "Сохранение..." : "Продолжить"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Scenarios */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-gray-900">3️⃣ Выбор сценариев перелинковки</h2>
                  <p className="text-gray-600">
                    Выберите сценарии, которые будут применены к вашему сайту
                  </p>
                </div>

                {/* Scenario Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      id: "headConsolidation",
                      title: "Консолидация заголовков",
                      description: "Связывание страниц с похожими H1 заголовками",
                      icon: Star
                    },
                    {
                      id: "clusterCrossLink", 
                      title: "Кросс-линковка кластеров",
                      description: "Перекрёстные ссылки между тематическими группами",
                      icon: Network
                    },
                    {
                      id: "commercialRouting",
                      title: "Коммерческая маршрутизация", 
                      description: "Направление трафика на коммерческие страницы",
                      icon: DollarSign
                    },
                    {
                      id: "orphanFix",
                      title: "Спасение сирот",
                      description: "Добавление ссылок на изолированные страницы",
                      icon: LifeBuoy
                    },
                    {
                      id: "depthLift",
                      title: "Поднятие глубоких",
                      description: "Улучшение доступности страниц с большой вложенностью",
                      icon: TrendingUp
                    },
                    {
                      id: "custom",
                      title: "Другое, настрою сам",
                      description: "Индивидуальная настройка параметров",
                      icon: Settings
                    }
                  ].map((scenario) => {
                    const Icon = scenario.icon;
                    const isSelected = selectedScenarios.includes(scenario.id);
                    
                    return (
                      <Card 
                        key={scenario.id}
                        className={`cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
                        }`}
                        onClick={() => toggleScenario(scenario.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onChange={() => toggleScenario(scenario.id)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon className="h-5 w-5 text-blue-600" />
                                <h3 className="font-medium text-gray-900">{scenario.title}</h3>
                              </div>
                              <p className="text-sm text-gray-600">{scenario.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* 2. Scope Selection */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">2️⃣ Какие страницы обрабатывать?</h4>
                  <RadioGroup 
                    value={scopeSettings.fullProject ? 'full' : 'custom'} 
                    onValueChange={(value) => setScopeSettings(prev => ({ ...prev, fullProject: value === 'full' }))}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="full" id="full" />
                      <Label htmlFor="full">Весь проект</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="custom" />
                      <Label htmlFor="custom">Уточнить выбор</Label>
                    </div>
                  </RadioGroup>

                  {!scopeSettings.fullProject && (
                    <div className="ml-6 space-y-4 p-4 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium text-gray-700">URL-подпуть</Label>
                          <Input
                            placeholder="/blog/"
                            value={scopeSettings.includePrefix}
                            onChange={(e) => setScopeSettings(prev => ({ ...prev, includePrefix: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Опубликованы после</Label>
                          <Input
                            type="date"
                            value={scopeSettings.dateAfter}
                            onChange={(e) => setScopeSettings(prev => ({ ...prev, dateAfter: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700">Список URL вручную</Label>
                        <Textarea
                          placeholder="https://example.com/page1&#10;https://example.com/page2"
                          className="mt-1 min-h-[80px]"
                          value={scopeSettings.manualUrls}
                          onChange={(e) => setScopeSettings(prev => ({ ...prev, manualUrls: e.target.value }))}
                        />
                      </div>
                      <div className="text-sm text-blue-600 font-medium">
                        Будет обработано: {scopeSettings.manualUrls.split('\n').filter(url => url.trim()).length} страниц
                      </div>
                    </div>
                  )}
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
                    onClick={() => setCurrentStep(4)}
                    disabled={selectedScenarios.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Настройки генерации
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Advanced Settings */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900">
                    4️⃣ Расширенные настройки генерации
                  </h3>
                  <p className="text-gray-600">
                    Настройте детальные параметры алгоритма перелинковки
                  </p>
                </div>

                {/* A. Лимиты ссылок */}
                <div className="space-y-4">
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Лимиты ссылок</h4>
                      <HelpDialog contentKey="limits" />
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
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Доля точных анкоров</h4>
                      <HelpDialog contentKey="exactAnchors" />
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

                  {/* C. Старые ссылки */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Старые ссылки</h4>
                      <HelpDialog contentKey="oldLinks" />
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

                  {/* D. Битые ссылки */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Битые (404) ссылки</h4>
                      <HelpDialog contentKey="brokenLinks" />
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

                  {/* E. Depth Lift Settings */}
                  {rules.scenarios.depthLift && (
                    <div className="border-b border-gray-200 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-md font-medium text-gray-900">Настройки Depth Lift</h4>
                        <HelpDialog contentKey="depthLift" />
                      </div>
                      
                      <div className="max-w-md">
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Считать URL глубже ≥ {rules.depthThreshold} кликов
                        </Label>
                        <Slider
                          value={[rules.depthThreshold]}
                          onValueChange={(value) => setRules(prev => ({ ...prev, depthThreshold: value[0] }))}
                          max={8}
                          min={4}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>4</span>
                          <span>8</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* F. Freshness Push Settings */}
                  {rules.freshnessPush && (
                    <div className="border-b border-gray-200 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-md font-medium text-gray-900">Настройки Freshness Push</h4>
                        <HelpDialog contentKey="freshnessPush" />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Новая статья = опубликована ≤ {rules.freshnessThreshold} дней
                          </Label>
                          <Slider
                            value={[rules.freshnessThreshold]}
                            onValueChange={(value) => setRules(prev => ({ ...prev, freshnessThreshold: value[0] }))}
                            max={365}
                            min={1}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>1</span>
                            <span>365</span>
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Ссылок со старой статьи → новой: {rules.freshnessLinks}
                          </Label>
                          <Slider
                            value={[rules.freshnessLinks]}
                            onValueChange={(value) => setRules(prev => ({ ...prev, freshnessLinks: value[0] }))}
                            max={3}
                            min={0}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>0</span>
                            <span>3</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* G. Stop-list and Money Pages */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Stop-лист и приоритеты</h4>
                      <HelpDialog contentKey="stoplist" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Stop-лист анкор-фраз
                        </Label>
                        <textarea
                          className="w-full p-3 border rounded-lg text-sm min-h-[100px] resize-y"
                          placeholder="читать далее&#10;подробнее&#10;click here&#10;здесь&#10;тут"
                          value={rules.stopAnchors.join('\n')}
                          onChange={(e) => setRules(prev => ({ 
                            ...prev, 
                            stopAnchors: e.target.value.split('\n').filter(anchor => anchor.trim()) 
                          }))}
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Приоритетные (money) URL
                        </Label>
                        <textarea
                          className="w-full p-3 border rounded-lg text-sm min-h-[100px] resize-y"
                          placeholder="/buy/&#10;/product/&#10;/services/&#10;/order/"
                          value={rules.moneyPages.join('\n')}
                          onChange={(e) => setRules(prev => ({ 
                            ...prev, 
                            moneyPages: e.target.value.split('\n').filter(url => url.trim()) 
                          }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* G2. HTML-атрибуты ссылок */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">HTML-атрибуты ссылок</h4>
                      <HelpDialog contentKey="htmlAttributes" />
                    </div>
                    
                    <div className="space-y-4">
                      {/* CSS класс - всегда видим */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          CSS-класс для &lt;a&gt;
                        </Label>
                        <input
                          type="text"
                          className="w-full p-3 border rounded-lg text-sm"
                          placeholder="internal-link"
                          value={rules.cssClass || ''}
                          onChange={(e) => setRules(prev => ({ 
                            ...prev, 
                            cssClass: e.target.value 
                          }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Позволяет стилизовать все вставляемые ссылки одной строкой CSS
                        </p>
                      </div>

                      {/* Дополнительные атрибуты - сворачиваемые */}
                      <div className="space-y-3">
                        <div 
                          className="flex items-center cursor-pointer select-none"
                          onClick={() => setRules(prev => ({ ...prev, showAdvancedHtml: !prev.showAdvancedHtml }))}
                        >
                          <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${rules.showAdvancedHtml ? 'rotate-180' : ''}`} />
                          <span className="text-sm font-medium text-gray-700">Дополнительные атрибуты</span>
                        </div>

                        {rules.showAdvancedHtml && (
                          <div className="pl-6 space-y-4 bg-gray-50 p-4 rounded-lg">
                            {/* rel атрибуты */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                                Добавлять rel
                              </Label>
                              <div className="space-y-2">
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={rules.relAttributes.noopener}
                                    onChange={(e) => setRules(prev => ({
                                      ...prev,
                                      relAttributes: { ...prev.relAttributes, noopener: e.target.checked }
                                    }))}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">noopener</span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={rules.relAttributes.noreferrer}
                                    onChange={(e) => setRules(prev => ({
                                      ...prev,
                                      relAttributes: { ...prev.relAttributes, noreferrer: e.target.checked }
                                    }))}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">noreferrer</span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={rules.relAttributes.nofollow}
                                    onChange={(e) => setRules(prev => ({
                                      ...prev,
                                      relAttributes: { ...prev.relAttributes, nofollow: e.target.checked }
                                    }))}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">nofollow</span>
                                </label>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Безопасность и контроль индексации
                              </p>
                            </div>

                            {/* target="_blank" */}
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm font-medium text-gray-700">
                                  target="_blank"
                                </Label>
                                <p className="text-xs text-gray-500">
                                  Открывать ли новые вкладки
                                </p>
                              </div>
                              <Switch
                                checked={rules.targetBlank}
                                onCheckedChange={(checked) => setRules(prev => ({ 
                                  ...prev, 
                                  targetBlank: checked 
                                }))}
                              />
                            </div>

                            {/* Обработка существующих классов */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                                Если ссылка уже содержит класс
                              </Label>
                              <div className="space-y-2">
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    name="existingClass"
                                    value="add"
                                    checked={rules.existingClassPolicy === 'add'}
                                    onChange={(e) => setRules(prev => ({ 
                                      ...prev, 
                                      existingClassPolicy: e.target.value as 'add' | 'replace'
                                    }))}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">Добавить к существующим</span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    name="existingClass"
                                    value="replace"
                                    checked={rules.existingClassPolicy === 'replace'}
                                    onChange={(e) => setRules(prev => ({ 
                                      ...prev, 
                                      existingClassPolicy: e.target.value as 'add' | 'replace'
                                    }))}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">Заменить</span>
                                </label>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Не ломаем ручную разметку редакторов
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* H. Cannibalization Settings */}
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-md font-medium text-gray-900">Каннибализация</h4>
                      <HelpDialog contentKey="cannibalization" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Чувствительность к дублям
                        </Label>
                        <Select defaultValue="medium">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">Высокая — строго</SelectItem>
                            <SelectItem value="medium">Средняя — баланс</SelectItem>
                            <SelectItem value="low">Низкая — мягко</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Действие при конфликте
                        </Label>
                        <Select defaultValue="block">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="block">Block — не ставить ссылки</SelectItem>
                            <SelectItem value="flag">Flag only — только пометить</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">
                          Как выбрать каноник
                        </Label>
                        <Select defaultValue="content">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="content">По полноте контента</SelectItem>
                            <SelectItem value="url">По URL-структуре</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(3)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Назад
                  </Button>
                  <Button 
                    onClick={handleGenerate}
                    disabled={selectedScenarios.length === 0 || generateMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    {generateMutation.isPending ? "Запуск..." : "Сохранить и запустить импорт"}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Success */}
            {currentStep === 5 && (
              <div className="text-center space-y-6">
                <div className="space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
                  <h3 className="text-xl font-semibold text-gray-900">
                    Генерация запущена!
                  </h3>
                  <p className="text-gray-600">
                    Ваш проект обрабатывается. Результаты будут доступны в течение нескольких минут.
                  </p>
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(4)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Назад к настройкам
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 bg-gray-50 p-6">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Прогресс проекта</h3>
              <div className="space-y-3">
                {[
                  { step: 1, title: "Загрузка данных", completed: currentStep > 1 },
                  { step: 2, title: "Сопоставление полей", completed: currentStep > 2 },
                  { step: 3, title: "Выбор сценариев", completed: currentStep > 3 },
                  { step: 4, title: "Настройки генерации", completed: currentStep > 4 },
                  { step: 5, title: "Запуск генерации", completed: currentStep === 5 },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      item.completed 
                        ? 'bg-green-100 text-green-600' 
                        : currentStep === item.step
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {item.completed ? '✓' : item.step}
                    </div>
                    <span className={`text-sm ${
                      item.completed || currentStep === item.step 
                        ? 'text-gray-900 font-medium' 
                        : 'text-gray-500'
                    }`}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-6">
              <h4 className="font-medium text-gray-900 mb-3">Помощь</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• Поддерживаются CSV файлы</p>
                <p>• Минимум требуется поле URL</p>
                <p>• Проверьте кодировку UTF-8</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}