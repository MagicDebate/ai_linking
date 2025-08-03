import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import ImportWizard from "./import-wizard";
import { 
  ArrowLeft,
  Settings,
  Upload,
  Target,
  FileText,
  CheckCircle2,
  Circle,
  Play
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "QUEUED" | "READY";
  updatedAt: string;
}

interface UserProgress {
  createProject: boolean;
  uploadTexts: boolean;
  setPriorities: boolean;
  generateDraft: boolean;
}

interface ProjectPageProps {
  projectId: string;
}

export default function ProjectPage({ projectId }: ProjectPageProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Get project details
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}`);
      return response.json();
    },
  });

  // Get user progress
  const { data: progress } = useQuery<UserProgress>({
    queryKey: ["/api/progress"],
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async (step: keyof UserProgress) => {
      const response = await apiRequest("POST", "/api/progress", { [step]: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
    },
  });

  const getProgressPercentage = () => {
    if (!progress) return 25; // Project created = 25%
    const completed = Object.values(progress).filter(Boolean).length;
    return (completed / 4) * 100;
  };

  const handleStepClick = (step: keyof UserProgress) => {
    if (step === "uploadTexts") {
      setShowImportWizard(true);
    }
  };

  const isStepAvailable = (step: keyof UserProgress) => {
    if (!progress) return false;
    switch (step) {
      case "createProject":
        return true;
      case "uploadTexts":
        return progress.createProject;
      case "setPriorities":
        return progress.uploadTexts;
      case "generateDraft":
        return progress.setPriorities;
      default:
        return false;
    }
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Проект не найден</h1>
          <Button onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Вернуться к проектам
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setLocation("/dashboard")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Все проекты
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{project.domain}</h1>
                <p className="text-sm text-gray-500">{project.name}</p>
              </div>
              <Badge variant={project.status === "READY" ? "default" : "secondary"}>
                {project.status === "READY" ? "Ready" : "Queued"}
              </Badge>
            </div>
            
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Настройки
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Progress Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Прогресс настройки
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Завершено</span>
                    <span className="text-sm text-gray-500">{Math.round(getProgressPercentage())}%</span>
                  </div>
                  <Progress value={getProgressPercentage()} className="h-2" />
                </div>

                <div className="space-y-4">
                  {/* Step 1: Create Project */}
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-green-600">Создать проект</span>
                  </div>
                  
                  {/* Step 2: Upload Texts */}
                  <div 
                    className={`flex items-center gap-3 ${
                      isStepAvailable("uploadTexts") && !progress?.uploadTexts 
                        ? "cursor-pointer hover:bg-gray-50 p-2 rounded-md -m-2" 
                        : ""
                    }`}
                    onClick={() => isStepAvailable("uploadTexts") && !progress?.uploadTexts && handleStepClick("uploadTexts")}
                  >
                    {progress?.uploadTexts ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={
                      progress?.uploadTexts ? "text-green-600" : 
                      isStepAvailable("uploadTexts") ? "text-blue-600 font-medium" : "text-gray-400"
                    }>
                      Загрузить тексты
                    </span>
                  </div>
                  
                  {/* Step 3: Set Priorities */}
                  <div className="flex items-center gap-3">
                    {progress?.setPriorities ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={
                      progress?.setPriorities ? "text-green-600" : 
                      isStepAvailable("setPriorities") ? "text-gray-700" : "text-gray-400"
                    }>
                      Задать приоритеты
                    </span>
                  </div>
                  
                  {/* Step 4: Generate Draft */}
                  <div className="flex items-center gap-3">
                    {progress?.generateDraft ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={
                      progress?.generateDraft ? "text-green-600" : 
                      isStepAvailable("generateDraft") ? "text-gray-700" : "text-gray-400"
                    }>
                      Сгенерировать черновик
                    </span>
                  </div>
                </div>

                {isStepAvailable("uploadTexts") && !progress?.uploadTexts && (
                  <Button 
                    onClick={() => setShowImportWizard(true)}
                    className="w-full flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Загрузить контент
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="space-y-6">
              {/* Welcome Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Добро пожаловать в проект {project.domain}!</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    Давайте настроим ваш проект для автоматизации внутренних ссылок. 
                    Следуйте шагам в боковой панели для полной настройки.
                  </p>
                  
                  {!progress?.uploadTexts && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-medium text-blue-900 mb-2">Следующий шаг: Загрузка контента</h3>
                      <p className="text-blue-800 text-sm mb-3">
                        Загрузите контент вашего сайта через CSV файл или используйте WordPress плагин
                      </p>
                      <Button 
                        onClick={() => setShowImportWizard(true)}
                        className="flex items-center gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        Начать загрузку
                      </Button>
                    </div>
                  )}

                  {progress?.uploadTexts && !progress?.setPriorities && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="font-medium text-green-900 mb-2">Контент загружен!</h3>
                      <p className="text-green-800 text-sm mb-3">
                        Теперь настройте приоритеты страниц для оптимизации внутренних ссылок
                      </p>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Настроить приоритеты
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <FileText className="h-8 w-8 text-blue-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Страницы</p>
                        <p className="text-2xl font-bold">-</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Target className="h-8 w-8 text-green-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Ссылки</p>
                        <p className="text-2xl font-bold">-</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <Play className="h-8 w-8 text-purple-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-gray-600">Готовность</p>
                        <p className="text-2xl font-bold">{Math.round(getProgressPercentage())}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import Wizard */}
      {showImportWizard && (
        <ImportWizard 
          projectId={projectId}
          onClose={() => setShowImportWizard(false)}
        />
      )}
    </div>
  );
}