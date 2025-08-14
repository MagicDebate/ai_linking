import React, { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useProjectState } from "@/hooks/useProjectState";
import { useProjectNavigation } from "@/hooks/useProjectNavigation";
import { useImportStatus } from "@/hooks/useImportStatus";
import { useProjectMutations } from "@/hooks/useProjectMutations";
import { useGeneration, useGenerationProgress } from "@/hooks/useGeneration";
import { ImportProgress } from "@/components/ImportProgress";
import { GenerationProgress } from "@/components/GenerationProgress";
import { SEOSettings, SEOProfile } from "@/components/SEOSettings";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Loader2,
  BarChart3,
  Clock,
  Play,
  Database
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

// Используем SEOProfile из компонента SEOSettings
const DEFAULT_PROFILE: SEOProfile = {
  maxLinks: 3,
  minGap: 100,
  exactAnchorPercent: 20,
  stopAnchors: [],
  priorityPages: [],
  hubPages: [],
  tasks: {
    orphanFix: true,
    headConsolidation: true,
    clusterCrossLink: true,
    commercialRouting: true,
    depthLift: { enabled: true, minDepth: 5 },
    freshnessPush: { enabled: true, daysFresh: 30, linksPerDonor: 1 }
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

export default function ProjectFixed() {
  const [, params] = useRoute("/project/:id/*");
  const [location, setLocation] = useLocation();
  const projectId = params?.id;
  const { toast } = useToast();
  
  console.log('🔍 ProjectFixed - projectId:', projectId);
  console.log('🔍 ProjectFixed - location:', location);
  
  // Хуки
  const { 
    projectState, 
    isLoading: stateLoading, 
    setCurrentStep, 
    setImportJobId, 
    setSeoProfile, 
    setStepData 
  } = useProjectState(projectId);

  // Generation hooks
  const { 
    startGeneration, 
    startGenerationAsync, 
    isStartingGeneration,
  } = useGeneration();

  const { navigateToStep, getCurrentStep } = useProjectNavigation();
  const { uploadMutation, mappingMutation, startImportMutation, generateLinksMutation } = useProjectMutations();
  
  // Определяем текущий шаг
  const currentStep = getCurrentStep(location);
  
  // Состояние импорта
  const importJobId = projectState?.importJobId || null;
  const { data: importStatus, isLoading: importStatusLoading } = useImportStatus(importJobId, currentStep);

  // Состояние генерации
  const { data: generationProgress, isLoading: generationLoading } = useGenerationProgress(generationRunId);
  
  // Локальное состояние
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [generationRunId, setGenerationRunId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  
  // SEO профиль
  const seoProfile = projectState?.seoProfile ? { ...DEFAULT_PROFILE, ...projectState.seoProfile } : DEFAULT_PROFILE;
  
  // Загрузка проекта
  const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['/api/projects', projectId],
    queryFn: async () => {
      console.log('🔍 Fetching project:', projectId);
      const response = await fetch(`/api/projects/${projectId}`, {
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Project fetch failed:', response.status, errorText);
        throw new Error(`Failed to fetch project: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ Project loaded:', data);
      return data as Promise<Project>;
    },
    enabled: !!projectId,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0
  });

  // Обработчики
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
    
    uploadMutation.mutate({ file, projectId: projectId! });
  };

  const handleUploadSuccess = async (data: any) => {
    console.log('Upload success:', data);
    const newCsvPreview = { ...data.preview, uploadId: data.uploadId };
    setCsvPreview(newCsvPreview);
    
    // Сохраняем состояние
    await setStepData({
      csvPreview: newCsvPreview,
      uploadedFile: uploadedFile ? { name: uploadedFile.name, size: uploadedFile.size } : null
    });
    
    toast({ title: "Файл загружен! Настройте маппинг полей." });
  };

  const handleMappingSubmit = async () => {
    if (!csvPreview?.uploadId) {
      toast({ title: "Ошибка", description: "Не найден ID загрузки", variant: "destructive" });
      return;
    }

    // Сохраняем маппинг
    await mappingMutation.mutateAsync({ 
      projectId: projectId!, 
      fieldMapping, 
      uploadId: csvPreview.uploadId 
    });

    // Сохраняем в чекпоинты
    await setStepData({ fieldMapping });
    
    // Запускаем импорт
    const result = await startImportMutation.mutateAsync({ 
      projectId: projectId!, 
      uploadId: csvPreview.uploadId 
    });
    
    // Сохраняем importJobId
    await setImportJobId(result.jobId);
    
    // Переходим к шагу 2
    await navigateToStep(2, projectId!);
    toast({ title: "Импорт запущен! Отслеживаем прогресс." });
  };

  const handleImportComplete = async () => {
    await navigateToStep(3, projectId!);
  };

  const handleBackToUpload = async () => {
    // Если есть данные CSV, показываем их, если нет - очищаем форму
    if (!csvPreview) {
      setUploadedFile(null);
      setFieldMapping({});
    }
    await navigateToStep(1, projectId!);
  };

  const handleGenerate = async () => {
    console.log('🚀 Starting generation with profile:', seoProfile);
    
    try {
      const result = await startGenerationAsync({ 
        projectId: projectId!, 
        seoProfile 
      });
      
      console.log('✅ Generation started:', result);
      setGenerationRunId(result.runId);
      
      toast({ title: "Генерация ссылок запущена!" });
      
      // Переходим к следующему шагу
      navigateToStep(4, projectId!);
      
    } catch (error) {
      console.error('❌ Generation error:', error);
      toast({ 
        title: "Ошибка запуска генерации", 
        description: error instanceof Error ? error.message : "Неизвестная ошибка",
        variant: "destructive" 
      });
    }
  };

  // Автоматический переход после завершения импорта
  useEffect(() => {
    if (importStatus?.status === 'completed' && currentStep === 2) {
      console.log('✅ Import completed, navigating to step 3');
      toast({ title: "Импорт завершен успешно!" });
      handleImportComplete();
    } else if (importStatus?.status === 'failed' && currentStep === 2) {
      console.log('❌ Import failed:', importStatus.error);
      toast({ 
        title: "Ошибка импорта", 
        description: importStatus.error || "Неизвестная ошибка",
        variant: "destructive" 
      });
    }
  }, [importStatus, currentStep]);

  // Автоматический переход после завершения генерации
  useEffect(() => {
    if (generationProgress?.status === 'draft' && currentStep === 4) {
      console.log('✅ Generation completed, navigating to step 5');
      toast({ title: "Генерация завершена! Черновик готов для ревью." });
      navigateToStep(5, projectId!);
    } else if (generationProgress?.status === 'failed' && currentStep === 4) {
      console.log('❌ Generation failed:', generationProgress.errorMessage);
      toast({ 
        title: "Ошибка генерации", 
        description: generationProgress.errorMessage || "Неизвестная ошибка",
        variant: "destructive" 
      });
    }
  }, [generationProgress, currentStep]);

  // Восстановление состояния
  useEffect(() => {
    if (projectState && !stateLoading) {
      console.log('🔄 Restoring state from checkpoints:', projectState);
      
      if (projectState.stepData?.csvPreview && !csvPreview) {
        setCsvPreview(projectState.stepData.csvPreview);
      }
      
      if (projectState.stepData?.fieldMapping && Object.keys(projectState.stepData.fieldMapping).length > 0 && Object.keys(fieldMapping).length === 0) {
        setFieldMapping(projectState.stepData.fieldMapping);
      }
      
      if (projectState.importJobId && !importJobId) {
        console.log('🔄 Restoring importJobId:', projectState.importJobId);
        setImportJobId(projectState.importJobId);
      }
      
      console.log('✅ State restored successfully');
    }
  }, [projectState, stateLoading, csvPreview, fieldMapping, importJobId, setImportJobId]);

  // Обработка успешной загрузки
  useEffect(() => {
    if (uploadMutation.isSuccess && uploadMutation.data) {
      handleUploadSuccess(uploadMutation.data);
    }
  }, [uploadMutation.isSuccess, uploadMutation.data]);

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

  if (projectError || !project) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-4xl mx-auto text-center py-16">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Ошибка загрузки проекта</h1>
            <p className="text-gray-600 mb-4">Не удалось загрузить проект. Возможно, проект был удален или у вас нет доступа к нему.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Обновить страницу
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const steps = [
    { number: 1, title: "Загрузка CSV и маппинг", description: "Загрузите файл и настройте поля данных" },
    { number: 2, title: "Импорт данных", description: "Обработка и анализ загруженного контента" },
    { number: 3, title: "SEO профиль", description: "Настройте пресеты, сценарии и параметры" },
    { number: 4, title: "Генерация ссылок", description: "Создание внутренних ссылок по сценариям" },
    { number: 5, title: "Проверка черновика", description: "Просмотр и редактирование предложенных ссылок" },
    { number: 6, title: "Готовый CSV", description: "Экспорт готовых ссылок для внедрения" }
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
                                  value={fieldMapping[field.key as keyof typeof fieldMapping] || 'none'}
                                  onValueChange={(value) => setFieldMapping(prev => ({ 
                                    ...prev, 
                                    [field.key]: value === 'none' ? '' : value 
                                  }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Выберите столбец" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Не используется</SelectItem>
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
                        onClick={handleMappingSubmit}
                        disabled={!csvPreview || !fieldMapping.url || !fieldMapping.title || !fieldMapping.content || mappingMutation.isPending || startImportMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {mappingMutation.isPending || startImportMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {mappingMutation.isPending ? 'Сохраняем маппинг...' : 'Запускаем импорт...'}
                          </>
                        ) : (
                          <>
                            Сохранить маппинг и запустить импорт
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Шаг 2: Импорт данных с прогрессом */}
              {currentStep === 2 && (
                <ImportProgress
                  importStatus={importStatus}
                  isLoading={importStatusLoading}
                  onBack={handleBackToUpload}
                  onNext={handleImportComplete}
                  projectId={projectId!}
                />
              )}

              {/* Шаг 3: SEO профиль */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <Settings className="h-16 w-16 text-green-600 mx-auto" />
                    <h3 className="text-xl font-semibold text-gray-900">
                      SEO профиль
                    </h3>
                    <p className="text-gray-600">
                      Настройте сценарии и параметры для генерации внутренних ссылок.
                    </p>
                  </div>

                  <SEOSettings
                    seoProfile={seoProfile}
                    onProfileChange={(newProfile) => {
                      setSeoProfile(newProfile);
                    }}
                    onGenerate={handleGenerate}
                    isGenerating={isStartingGeneration}
                  />

                  <div className="flex justify-center">
                    <Button variant="outline" onClick={handleBackToUpload}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Назад к импорту
                    </Button>
                  </div>
                </div>
              )}

              {/* Шаг 4: Генерация ссылок */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  {!generationRunId ? (
                    // Начальный экран - кнопка запуска
                    <div className="text-center space-y-6">
                      <div className="space-y-4">
                        <BarChart3 className="h-16 w-16 text-green-600 mx-auto" />
                        <h3 className="text-xl font-semibold text-gray-900">
                          Генерация ссылок
                        </h3>
                        <p className="text-gray-600">
                          Создаем внутренние ссылки по настроенным сценариям и параметрам.
                        </p>
                      </div>

                      <div className="flex justify-center gap-4">
                        <Button variant="outline" onClick={() => navigateToStep(3, projectId!)}>
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Назад к SEO настройкам
                        </Button>
                        <Button 
                          onClick={handleGenerate}
                          disabled={isStartingGeneration}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isStartingGeneration ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Запускаем генерацию...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Запустить генерацию ссылок
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Экран прогресса генерации
                    <div className="space-y-6">
                      <div className="flex justify-center">
                        <Button variant="outline" onClick={() => navigateToStep(3, projectId!)}>
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Назад к SEO настройкам
                        </Button>
                      </div>
                      
                      {generationLoading ? (
                        <div className="text-center space-y-4">
                          <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin" />
                          <p className="text-blue-600 font-medium">Загружаем прогресс генерации...</p>
                        </div>
                      ) : generationProgress ? (
                        <GenerationProgress
                          runId={generationRunId}
                          status={generationProgress.status}
                          phase={generationProgress.phase}
                          percent={generationProgress.percent}
                          generated={generationProgress.generated}
                          rejected={generationProgress.rejected}
                          taskProgress={generationProgress.taskProgress}
                          counters={generationProgress.counters}
                          startedAt={generationProgress.startedAt}
                          finishedAt={generationProgress.finishedAt}
                          errorMessage={generationProgress.errorMessage}
                        />
                      ) : (
                        <div className="text-center space-y-4">
                          <AlertCircle className="h-12 w-12 text-red-600 mx-auto" />
                          <p className="text-red-600 font-medium">Ошибка загрузки прогресса</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Шаг 5: Проверка черновика */}
              {currentStep === 5 && (
                <div className="text-center space-y-6">
                  <div className="space-y-4">
                    <FileText className="h-16 w-16 text-orange-600 mx-auto" />
                    <h3 className="text-xl font-semibold text-gray-900">
                      Проверка черновика
                    </h3>
                    <p className="text-gray-600">
                      Просмотрите и отредактируйте предложенные ссылки перед финализацией.
                    </p>
                  </div>

                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={() => navigateToStep(4, projectId!)}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Назад к генерации
                    </Button>
                    <Button 
                      onClick={() => navigateToStep(6, projectId!)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Перейти к финализации
                    </Button>
                  </div>
                </div>
              )}

              {/* Шаг 6: Готовый CSV */}
              {currentStep === 6 && (
                <div className="text-center space-y-6">
                  <div className="space-y-4">
                    <Download className="h-16 w-16 text-green-600 mx-auto" />
                    <h3 className="text-xl font-semibold text-gray-900">
                      Готовый CSV
                    </h3>
                    <p className="text-gray-600">
                      Экспортируйте готовые ссылки для внедрения на сайт.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        <h4 className="text-lg font-medium text-green-900">
                          Генерация завершена успешно!
                        </h4>
                      </div>
                      <p className="text-green-700 mb-4">
                        Все ссылки созданы и готовы к экспорту. Вы можете скачать CSV файл с результатами.
                      </p>
                    </div>

                    <div className="flex justify-center gap-4">
                      <Button variant="outline" onClick={() => navigateToStep(5, projectId!)}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Назад к черновику
                      </Button>
                      <Button 
                        onClick={() => {
                          toast({ title: "CSV файл скачивается..." });
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Скачать CSV
                      </Button>
                    </div>
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
