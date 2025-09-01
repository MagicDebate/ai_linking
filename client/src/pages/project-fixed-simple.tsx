import React, { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useProjectState } from "@/hooks/useProjectState";
import { useProjectNavigation } from "@/hooks/useProjectNavigation";
import { useImportStatus } from "@/hooks/useImportStatus";
import { useProjectMutations } from "@/hooks/useProjectMutations";
import { useGeneration } from "@/hooks/useGeneration";
import { useGenerationProgress } from "@/hooks/useGenerationProgress";
import { ImportProgress } from "@/components/ImportProgress";
import { GenerationProgress } from "@/components/GenerationProgress";
import { SEOSettings, SEOProfile } from "@/components/SEOSettings";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast-simple";
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

export default function ProjectFixedSimple() {
  const [, params] = useRoute("/project/:id/*");
  const [location, setLocation] = useLocation();
  const projectId = params?.id;
  const { toast } = useToast();
  
  console.log('🔍 ProjectFixedSimple - projectId:', projectId);
  console.log('🔍 ProjectFixedSimple - location:', location);
  
  // Хуки
  const { 
    projectState, 
    isLoading: stateLoading, 
    setCurrentStep, 
    setImportJobId, 
    setSeoProfile, 
    setStepData 
  } = useProjectState(projectId);

  const { navigateToStep } = useProjectNavigation(projectId, setCurrentStep);
  const { importStatus, isLoading: importLoading } = useImportStatus(projectState?.importJobId);
  const { 
    uploadFile, 
    mapFields, 
    startImport, 
    isUploading, 
    isMapping, 
    isStartingImport 
  } = useProjectMutations(projectId, setImportJobId, setStepData);

  const { 
    startGenerationAsync, 
    isStartingGeneration,
  } = useGeneration();

  const { data: generationProgress, isLoading: generationLoading } = useGenerationProgress(generationRunId);

  // Local state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [seoProfile, setSeoProfileLocal] = useState<SEOProfile>(DEFAULT_PROFILE);
  const [generationRunId, setGenerationRunId] = useState<string | null>(null);

  // Get current step from URL or state
  const getCurrentStep = () => {
    if (location.includes('/upload')) return 1;
    if (location.includes('/import')) return 2;
    if (location.includes('/settings')) return 3;
    if (location.includes('/generate')) return 4;
    if (location.includes('/draft')) return 5;
    if (location.includes('/export')) return 6;
    return projectState?.currentStep || 1;
  };

  const currentStep = getCurrentStep();

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    try {
      const result = await uploadFile(file);
      setCsvPreview(result);
      toast({ title: "Файл загружен успешно!" });
    } catch (error) {
      toast({ title: "Ошибка загрузки файла", description: error.message, variant: "destructive" });
    }
  };

  // Handle field mapping
  const handleFieldMapping = async () => {
    try {
      await mapFields(fieldMapping);
      toast({ title: "Поля сопоставлены успешно!" });
      navigateToStep(2);
    } catch (error) {
      toast({ title: "Ошибка сопоставления полей", description: error.message, variant: "destructive" });
    }
  };

  // Handle import start
  const handleStartImport = async () => {
    try {
      await startImport();
      toast({ title: "Импорт запущен!" });
      navigateToStep(2);
    } catch (error) {
      toast({ title: "Ошибка запуска импорта", description: error.message, variant: "destructive" });
    }
  };

  // Handle generation start
  const handleGenerate = async () => {
    try {
      const result = await startGenerationAsync({ projectId: projectId!, seoProfile });
      setGenerationRunId(result.runId);
      toast({ title: "Генерация ссылок запущена!" });
      navigateToStep(4);
    } catch (error) {
      toast({ title: "Ошибка запуска генерации", description: error.message, variant: "destructive" });
    }
  };

  // Auto-transition from import to settings
  useEffect(() => {
    if (importStatus?.status === 'completed' && currentStep === 2) {
      navigateToStep(3);
    }
  }, [importStatus?.status, currentStep, navigateToStep]);

  // Auto-transition from generation to draft
  useEffect(() => {
    if (generationProgress?.status === 'draft' && currentStep === 4) {
      navigateToStep(5);
    }
  }, [generationProgress?.status, currentStep, navigateToStep]);

  // Handle back to upload
  const handleBackToUpload = () => {
    if (csvPreview) {
      setCsvPreview(null);
      setUploadedFile(null);
      setFieldMapping({});
    }
    navigateToStep(1);
  };

  if (stateLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Загрузка проекта...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Проект: {projectId}</h1>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span>Шаг {currentStep} из 6</span>
            <span>•</span>
            <span>Статус: {projectState?.status || 'Загрузка...'}</span>
          </div>
        </div>

        {/* Step 1: Upload */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="mr-2 h-5 w-5" />
                Загрузка CSV файла
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="file">Выберите CSV файл</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    disabled={isUploading}
                  />
                </div>
                
                {csvPreview && (
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Предварительный просмотр:</h3>
                    <div className="border rounded p-4 bg-gray-50">
                      <p><strong>Заголовки:</strong> {csvPreview.headers.join(', ')}</p>
                      <p><strong>Строк:</strong> {csvPreview.rows.length}</p>
                    </div>
                  </div>
                )}

                {csvPreview && (
                  <div className="space-y-4">
                    <h3 className="font-semibold">Сопоставление полей:</h3>
                    {csvPreview.headers.map((header) => (
                      <div key={header} className="flex items-center space-x-4">
                        <Label className="w-32">{header}:</Label>
                        <Select
                          value={fieldMapping[header] || ''}
                          onValueChange={(value) => setFieldMapping(prev => ({ ...prev, [header]: value }))}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Выберите поле" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="url">URL</SelectItem>
                            <SelectItem value="title">Заголовок</SelectItem>
                            <SelectItem value="content">Контент</SelectItem>
                            <SelectItem value="skip">Пропустить</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    
                    <Button 
                      onClick={handleFieldMapping}
                      disabled={isMapping}
                      className="w-full"
                    >
                      {isMapping ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Сопоставление...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Продолжить
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Import Progress */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Database className="mr-2 h-5 w-5" />
                Импорт данных
              </CardTitle>
            </CardHeader>
            <CardContent>
              {importStatus ? (
                <ImportProgress 
                  status={importStatus.status}
                  phase={importStatus.phase}
                  percent={importStatus.percent}
                  processed={importStatus.processed}
                  total={importStatus.total}
                  errorMessage={importStatus.errorMessage}
                />
              ) : (
                <div className="text-center py-8">
                  <Button onClick={handleStartImport} disabled={isStartingImport}>
                    {isStartingImport ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Запуск импорта...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Запустить импорт
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: SEO Settings */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                Настройки генерации
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SEOSettings 
                seoProfile={seoProfile}
                onProfileChange={setSeoProfileLocal}
                onGenerate={handleGenerate}
                isGenerating={isStartingGeneration}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 4: Generation Progress */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-2 h-5 w-5" />
                Генерация ссылок
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generationRunId ? (
                <GenerationProgress 
                  runId={generationRunId}
                  status={generationProgress?.status || 'running'}
                  phase={generationProgress?.phase || 'Инициализация'}
                  percent={generationProgress?.percent || 0}
                  generated={generationProgress?.generated || 0}
                  rejected={generationProgress?.rejected || 0}
                  taskProgress={generationProgress?.taskProgress || {}}
                  counters={generationProgress?.counters || { scanned: 0, candidates: 0, accepted: 0, rejected: 0 }}
                  startedAt={generationProgress?.startedAt || new Date().toISOString()}
                  finishedAt={generationProgress?.finishedAt}
                  errorMessage={generationProgress?.errorMessage}
                />
              ) : (
                <div className="text-center py-8">
                  <Button onClick={handleGenerate} disabled={isStartingGeneration}>
                    {isStartingGeneration ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Запуск генерации...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Запустить генерацию
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={() => navigateToStep(currentStep - 1)}
            disabled={currentStep <= 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
          
          <Button
            onClick={() => navigateToStep(currentStep + 1)}
            disabled={currentStep >= 6}
          >
            Далее
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </Layout>
  );
}





