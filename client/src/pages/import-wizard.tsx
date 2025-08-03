import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Globe,
  CheckCircle2,
  ArrowRight,
  Download,
  AlertCircle,
  X
} from "lucide-react";

interface ImportWizardProps {
  projectId: string;
  onClose: () => void;
}

interface FieldMapping {
  [key: string]: string;
}

interface CsvPreview {
  headers: string[];
  rows: string[][];
}

export default function ImportWizard({ projectId, onClose }: ImportWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      
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
      setActiveTab("mapping");
      toast({
        title: "Успешно",
        description: "Файл загружен и обработан!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Field mapping submission
  const mappingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/import/field-map", {
        uploadId: uploadMutation.data?.uploadId,
        fieldMapping,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      setIsProcessing(true);
      toast({
        title: "Успешно",
        description: "Импорт запущен!",
      });
      setTimeout(() => {
        onClose();
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
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
    setCsvPreview(null); // Очистить предыдущий превью
    setFieldMapping({}); // Очистить предыдущее сопоставление
    uploadMutation.mutate(file);
  };

  const handleFieldMappingChange = (originalField: string, mappedField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [originalField]: mappedField
    }));
  };



  const downloadWordPressPlugin = () => {
    // In a real implementation, this would download the actual plugin file
    const pluginContent = `<?php
/*
Plugin Name: SEO LinkBuilder Export
Description: Exports your WordPress content for SEO LinkBuilder
Version: 1.0
*/

// Plugin implementation would go here
`;
    
    const blob = new Blob([pluginContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seo-linkbuilder-export.php';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isProcessing) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Обработка контента</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Импортируем ваш контент...</p>
            <p className="text-sm text-gray-500 mt-2">Это может занять несколько минут</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Импорт контента
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Загрузка
            </TabsTrigger>
            <TabsTrigger value="mapping" disabled={!csvPreview} className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Настройка полей
            </TabsTrigger>
            <TabsTrigger value="wordpress" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              WordPress плагин
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CSV Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    CSV/JSON файл
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Загрузите CSV или JSON файл с контентом вашего сайта
                  </p>
                  
                  <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    uploadMutation.isPending ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                  }`}>
                    {uploadMutation.isPending ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <Button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploadMutation.isPending}
                      className="mb-2"
                    >
                      {uploadMutation.isPending ? "Загружаем..." : "Выбрать файл"}
                    </Button>
                    <p className="text-xs text-gray-500">
                      {uploadMutation.isPending ? "Обрабатываем файл..." : "CSV, JSON до 10MB"}
                    </p>
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
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-800">{uploadedFile.name}</span>
                    </div>
                  )}

                  <a
                    href="data:text/csv;charset=utf-8,title%2Curl%2Ccontent%2Cmeta_description%0A%22%D0%9A%D0%B0%D0%BA%20%D0%B2%D1%8B%D0%B1%D1%80%D0%B0%D1%82%D1%8C%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%BE%22%2C%22%2Fblog%2Fseo-agency%22%2C%22%D0%9F%D0%BE%D0%BB%D0%BD%D0%BE%D0%B5%20%D1%80%D1%83%D0%BA%D0%BE%D0%B2%D0%BE%D0%B4%D1%81%D1%82%D0%B2%D0%BE%20%D0%BF%D0%BE%20%D0%B2%D1%8B%D0%B1%D0%BE%D1%80%D1%83%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%B0...%22%2C%22%D0%A3%D0%B7%D0%BD%D0%B0%D0%B9%D1%82%D0%B5%20%D0%BA%D0%B0%D0%BA%20%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D1%8C%D0%BD%D0%BE%20%D0%B2%D1%8B%D0%B1%D1%80%D0%B0%D1%82%D1%8C%20SEO%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%D1%81%D1%82%D0%B2%D0%BE%22%0A%22%D0%92%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D0%B5%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B8%20%D0%B2%20SEO%22%2C%22%2Fblog%2Finternal-links%22%2C%22%D0%92%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D0%B5%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B8%20%D0%B8%D0%B3%D1%80%D0%B0%D1%8E%D1%82%20%D0%B2%D0%B0%D0%B6%D0%BD%D1%83%D1%8E%20%D1%80%D0%BE%D0%BB%D1%8C...%22%2C%22%D0%92%D1%81%D0%B5%20%D0%BE%20%D0%B2%D0%BD%D1%83%D1%82%D1%80%D0%B5%D0%BD%D0%BD%D0%B8%D1%85%20%D1%81%D1%81%D1%8B%D0%BB%D0%BA%D0%B0%D1%85%20%D0%B4%D0%BB%D1%8F%20SEO%22%0A%22%D0%90%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2%22%2C%22%2Fservices%2Fcompetitor-analysis%22%2C%22%D0%9F%D1%80%D0%BE%D0%B2%D0%BE%D0%B4%D0%B8%D0%BC%20%D0%B3%D0%BB%D1%83%D0%B1%D0%BE%D0%BA%D0%B8%D0%B9%20%D0%B0%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2...%22%2C%22%D0%90%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20%D0%BA%D0%BE%D0%BD%D0%BA%D1%83%D1%80%D0%B5%D0%BD%D1%82%D0%BE%D0%B2%20%D0%B4%D0%BB%D1%8F%20%D1%83%D1%81%D0%BF%D0%B5%D1%88%D0%BD%D0%BE%D0%B3%D0%BE%20SEO%22"
                    download="sample_content.csv"
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Download className="h-4 w-4" />
                    Скачать пример CSV
                  </a>
                </CardContent>
              </Card>

              {/* WordPress Plugin */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    WordPress плагин
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Автоматический экспорт контента из WordPress
                  </p>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                        1
                      </div>
                      <div>
                        <p className="text-sm font-medium">Скачайте плагин</p>
                        <p className="text-xs text-gray-600">Загрузите наш бесплатный плагин для WordPress</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                        2
                      </div>
                      <div>
                        <p className="text-sm font-medium">Установите плагин</p>
                        <p className="text-xs text-gray-600">Загрузите через админ-панель WordPress</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                        3
                      </div>
                      <div>
                        <p className="text-sm font-medium">Экспортируйте контент</p>
                        <p className="text-xs text-gray-600">Плагин автоматически подготовит данные</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={downloadWordPressPlugin}
                    className="w-full flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Скачать плагин
                  </Button>
                  
                  <Button
                    onClick={() => setActiveTab("wordpress")}
                    className="w-full flex items-center gap-2"
                  >
                    Настроить подключение
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mapping" className="space-y-6">
            {csvPreview && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Настройка полей</CardTitle>
                    <p className="text-sm text-gray-600">
                      Сопоставьте поля из вашего файла с полями нашей системы
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {csvPreview.headers.map((header, index) => (
                        <div key={index} className="space-y-2">
                          <Label>Поле "{header}"</Label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={fieldMapping[header] || ""}
                            onChange={(e) => handleFieldMappingChange(header, e.target.value)}
                          >
                            <option value="">Не использовать</option>
                            <option value="title">Заголовок страницы</option>
                            <option value="url">URL страницы</option>
                            <option value="content">Содержимое</option>
                            <option value="meta_description">Мета-описание</option>
                            <option value="keywords">Ключевые слова</option>
                            <option value="category">Категория</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle>Предварительный просмотр</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            {csvPreview.headers.map((header, index) => (
                              <th key={index} className="text-left p-2 font-medium">
                                {header}
                                {fieldMapping[header] && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    → {fieldMapping[header]}
                                  </div>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.rows.slice(0, 3).map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="p-2 max-w-xs truncate">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setActiveTab("upload")}
                    variant="outline"
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={() => mappingMutation.mutate()}
                    disabled={mappingMutation.isPending || Object.keys(fieldMapping).length === 0}
                    className="flex items-center gap-2"
                  >
                    {mappingMutation.isPending ? "Обрабатываем..." : "Импортировать"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="wordpress" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Подключение WordPress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">В разработке</span>
                  </div>
                  <p className="text-blue-800 text-sm">
                    Прямое подключение к WordPress API находится в разработке. 
                    Пока используйте CSV экспорт или скачайте наш плагин.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="wp-url">URL сайта WordPress</Label>
                    <Input
                      id="wp-url"
                      placeholder="https://example.com"
                      disabled
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="wp-token">API токен</Label>
                    <Input
                      id="wp-token"
                      type="password"
                      placeholder="Введите API токен"
                      disabled
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setActiveTab("upload")}>
                    Назад к загрузке
                  </Button>
                  <Button disabled>
                    Подключить (скоро)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}