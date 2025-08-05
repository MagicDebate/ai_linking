import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  MoreVertical, 
  Settings, 
  LogOut, 
  User, 
  CheckCircle2, 
  Circle,
  X,
  ExternalLink,
  Lightbulb,
  Upload,
  Bug
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";


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

interface CreateProjectForm {
  name: string;
  domain: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);


  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateProjectForm>();

  // Check localStorage for dismissed notification
  useEffect(() => {
    const dismissed = localStorage.getItem("seo-notification-dismissed");
    setNotificationDismissed(dismissed === "true");
  }, []);

  // Queries
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: progress } = useQuery<UserProgress>({
    queryKey: ["/api/progress"],
  });

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectForm) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      setIsCreateProjectOpen(false);
      reset();
      toast({
        title: "Успешно",
        description: "Проект создан!",
      });
      // Redirect to project page
      setLocation(`/project/${newProject.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Успешно",
        description: "Проект удален!",
      });
    },
  });

  const handleLogout = () => {
    logout.mutate();
  };

  const onCreateProject = (data: CreateProjectForm) => {
    createProjectMutation.mutate(data);
  };

  const handleDeleteProject = (id: string) => {
    if (confirm("Удалить проект?")) {
      deleteProjectMutation.mutate(id);
    }
  };

  const dismissNotification = () => {
    localStorage.setItem("seo-notification-dismissed", "true");
    setNotificationDismissed(true);
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    const completed = Object.values(progress).filter(Boolean).length;
    return (completed / 4) * 100;
  };

  const getCompletedSteps = () => {
    if (!progress) return 0;
    return Object.values(progress).filter(Boolean).length;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-blue-600 cursor-pointer">
                SEO LinkBuilder
              </h1>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {user?.email}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  Настройки
                </DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Выход
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {!notificationDismissed && (
        <div className="bg-blue-50 border-b border-blue-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Lightbulb className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-blue-800">
                  Новый алгоритм детекта каннибализации доступен 💡
                </span>
                <Button variant="link" className="text-blue-600 p-0 ml-2 h-auto">
                  Подробнее
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={dismissNotification}
                className="text-blue-600 hover:bg-blue-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Title Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Ваши проекты</h1>
                  <p className="text-gray-600">Управляйте внутренними ссылками в один клик</p>
                </div>

              </div>
            </div>

            {/* Content Area */}
            <div className="space-y-6">
              {/* Create Project Card */}
              <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
                <DialogTrigger asChild>
                  <Card className="border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors cursor-pointer">
                    <CardContent className="p-8 text-center">
                      <Plus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Создать проект</h3>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>1 — Укажите домен</p>
                        <p>2 — Загрузите тексты</p>
                        <p>3 — Получите черновик</p>
                      </div>
                    </CardContent>
                  </Card>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создать новый проект</DialogTitle>
                  </DialogHeader>
                  <p className="sr-only">Форма для создания нового SEO проекта с указанием названия и домена</p>
                  <form onSubmit={handleSubmit(onCreateProject)} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Название проекта</Label>
                      <Input
                        id="name"
                        placeholder="Мой SEO проект"
                        {...register("name", { required: "Название обязательно" })}
                      />
                      {errors.name && (
                        <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="domain">Домен</Label>
                      <Input
                        id="domain"
                        placeholder="example.com"
                        {...register("domain", { required: "Домен обязателен" })}
                      />
                      {errors.domain && (
                        <p className="text-sm text-red-600 mt-1">{errors.domain.message}</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button type="submit" disabled={createProjectMutation.isPending}>
                        {createProjectMutation.isPending ? "Создаем..." : "Создать"}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsCreateProjectOpen(false)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Project List */}
              {projects.length > 0 && (
                <div className="space-y-4">
                  {projects.slice(0, 5).map((project) => (
                    <Card key={project.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div 
                            className="flex-1 cursor-pointer"
                            onClick={() => setLocation(`/project/${project.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">{project.domain}</h3>
                                <p className="text-sm text-gray-500">{project.name}</p>
                              </div>
                              <Badge variant={project.status === "READY" ? "default" : "secondary"}>
                                {project.status === "READY" ? "Ready" : "Queued"}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                              обновлено {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                            </p>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Settings className="h-4 w-4 mr-2" />
                                Настройки
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteProject(project.id)}
                                className="text-red-600"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {projects.length > 5 && (
                    <Button variant="outline" className="w-full">
                      Показать все проекты ({projects.length})
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* FAQ Section */}
            <div className="mt-16 max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="spam">
                  <AccordionTrigger>Сервис добавит спам-ссылки и меня забанит Google?</AccordionTrigger>
                  <AccordionContent>
                    Наш алгоритм полностью соответствует рекомендациям Google по внутренней перелинковке. 
                    Мы создаем только релевантные связи между страницами, основываясь на семантическом анализе контента.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="approval">
                  <AccordionTrigger>Как убедиться, что ничего не публикуется без моего одобрения?</AccordionTrigger>
                  <AccordionContent>
                    Все изменения создаются в виде черновика. Ничего не публикуется автоматически - 
                    вы всегда контролируете финальное решение о внедрении предложенных ссылок.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="security">
                  <AccordionTrigger>Данные клиента под NDA, безопасно ли?</AccordionTrigger>
                  <AccordionContent>
                    Все данные шифруются при передаче и хранении. Тексты автоматически удаляются 
                    после обработки. Мы соблюдаем все требования GDPR и можем подписать NDA.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="canonicalization">
                  <AccordionTrigger>Что с каноникой и каннибализацией?</AccordionTrigger>
                  <AccordionContent>
                    У нас есть встроенный детектор каннибализации ключевых слов. 
                    Система автоматически определяет конфликтующие страницы и предлагает оптимальную структуру ссылок.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="manual">
                  <AccordionTrigger>Как защитить ручную сетку ссылок?</AccordionTrigger>
                  <AccordionContent>
                    Вы можете создать стоп-лист страниц и анкоров, которые система не должна изменять. 
                    Ручные ссылки будут полностью сохранены.
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="cms">
                  <AccordionTrigger>Поддерживает ли сервис нестандартные CMS?</AccordionTrigger>
                  <AccordionContent>
                    Да! Мы поддерживаем экспорт/импорт через CSV, интеграцию с Git, 
                    а также имеем готовый плагин для WordPress.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 flex-shrink-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Первый запуск
                  <span className="text-sm font-normal text-gray-500">
                    {getCompletedSteps()}/4
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={getProgressPercentage()} className="w-full" />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {progress?.createProject ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={progress?.createProject ? "text-green-600" : "text-gray-700"}>
                      Создать проект
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {progress?.uploadTexts ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={progress?.uploadTexts ? "text-green-600" : "text-gray-400"}>
                      Загрузить тексты
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {progress?.setPriorities ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={
                      progress?.setPriorities ? "text-green-600" : 
                      !progress?.uploadTexts ? "text-gray-400" : "text-gray-700"
                    }>
                      Выбрать приоритеты
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {progress?.generateDraft ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className={
                      progress?.generateDraft ? "text-green-600" : 
                      !progress?.setPriorities ? "text-gray-400" : "text-gray-700"
                    }>
                      Сгенерировать черновик
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Debug section */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Отладка</CardTitle>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.open('/debug/pages', '_blank')}
                >
                  <Bug className="w-4 h-4 mr-2" />
                  Посмотреть данные страниц
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Import Wizard */}

    </div>
  );
}