import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Settings,
  Loader2,
  BarChart3,
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

export default function ProjectFixedMinimal() {
  const [, params] = useRoute("/project/:id/*");
  const [location, setLocation] = useLocation();
  const projectId = params?.id;
  
  console.log('🔍 ProjectFixedMinimal - projectId:', projectId);
  console.log('🔍 ProjectFixedMinimal - location:', location);
  
  // Local state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current step from URL
  const getCurrentStep = () => {
    if (location.includes('/upload')) return 1;
    if (location.includes('/import')) return 2;
    if (location.includes('/settings')) return 3;
    if (location.includes('/generate')) return 4;
    if (location.includes('/draft')) return 5;
    if (location.includes('/export')) return 6;
    return 1;
  };

  const currentStep = getCurrentStep();

  // Simple navigation
  const navigateToStep = (step: number) => {
    const stepPaths = ['', '/upload', '/import', '/settings', '/generate', '/draft', '/export'];
    window.history.pushState(null, '', `/project/${projectId}${stepPaths[step]}`);
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload file');
      }
      
      const result = await response.json();
      setCsvPreview(result);
      console.log('✅ File uploaded successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('❌ Upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Загрузка...</span>
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
            <span>Статус: Активный</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

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
                    disabled={isLoading}
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
                      onClick={() => navigateToStep(2)}
                      className="w-full"
                    >
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Продолжить
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
              <div className="text-center py-8">
                <p>Импорт данных будет здесь</p>
                <Button onClick={() => navigateToStep(3)} className="mt-4">
                  Продолжить
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
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
              <div className="text-center py-8">
                <p>Настройки генерации будут здесь</p>
                <Button onClick={() => navigateToStep(4)} className="mt-4">
                  Продолжить
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
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
              <div className="text-center py-8">
                <p>Генерация ссылок будет здесь</p>
                <Button onClick={() => navigateToStep(5)} className="mt-4">
                  Продолжить
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
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
