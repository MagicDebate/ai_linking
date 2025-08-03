import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter"; 
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  Download, 
  Copy, 
  ArrowLeft, 
  ArrowRight,
  FileText,
  Plug,
  CheckCircle2
} from "lucide-react";

interface ImportWizardProps {
  projectId: string;
  onClose: () => void;
}

type WizardStep = "source" | "mapping";
type ImportSource = "csv" | "wordpress";

interface FilePreview {
  headers: string[];
  rows: string[][];
}

interface FieldMapping {
  [systemField: string]: string;
}

const SYSTEM_FIELDS = [
  { value: "url", label: "URL", required: true },
  { value: "html", label: "HTML/Markdown", required: true },
  { value: "meta_title", label: "Meta Title", required: true },
  { value: "meta_description", label: "Meta Description", required: true },
  { value: "h1", label: "H1", required: false },
  { value: "lang", label: "Language", required: false },
  { value: "pub_date", label: "Publication Date", required: false },
  { value: "page_type", label: "Page Type", required: false },
  { value: "skip", label: "Не импортировать", required: false },
];

const AUTO_MAPPING: { [key: string]: string[] } = {
  url: ["url", "link", "address"],
  html: ["html", "body", "content", "markdown"],
  meta_title: ["title", "meta_title"],
  meta_description: ["description", "descr", "meta_description"],
};

export default function ImportWizard({ projectId, onClose }: ImportWizardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<WizardStep>("source");
  const [source, setSource] = useState<ImportSource | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({});

  // Get project API key
  const { data: apiKeyData } = useQuery({
    queryKey: ["/api/projects", projectId, "api-key"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/projects/${projectId}/api-key`);
        return response.json();
      } catch (error: any) {
        if (error.message.includes("404")) {
          return null;
        }
        throw error;
      }
    },
    enabled: source === "wordpress",
  });

  // Get file preview
  const { data: preview } = useQuery<FilePreview>({
    queryKey: ["/api/import/preview", uploadId],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/import/preview?uploadId=${uploadId}`);
      return response.json();
    },
    enabled: !!uploadId && step === "mapping",
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiRequest("POST", "/api/import/upload", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setUploadId(data.uploadId);
      setStep("mapping");
      toast({
        title: "Успешно",
        description: "Файл загружен!",
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

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/api-key`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "api-key"] });
      toast({
        title: "Успешно",
        description: "API ключ создан!",
      });
    },
  });

  // Field mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: async (mapping: FieldMapping) => {
      const response = await apiRequest("POST", "/api/import/field-map", {
        uploadId,
        mapping,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Данные успешно импортированы!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/progress"] });
      onClose();
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleNext = () => {
    if (step === "source") {
      if (source === "wordpress") {
        // WordPress path - skip to final step
        toast({
          title: "WordPress интеграция",
          description: "Установите плагин и используйте API ключ для отправки контента",
        });
        onClose();
      } else if (uploadId) {
        setStep("mapping");
        // Auto-detect field mappings
        if (preview) {
          const autoMapping: FieldMapping = {};
          preview.headers.forEach(header => {
            const lowerHeader = header.toLowerCase();
            for (const [systemField, variants] of Object.entries(AUTO_MAPPING)) {
              if (variants.some(variant => lowerHeader.includes(variant))) {
                autoMapping[systemField] = header;
                break;
              }
            }
          });
          setFieldMapping(autoMapping);
        }
      }
    } else if (step === "mapping") {
      // Validate required fields
      const requiredFields = SYSTEM_FIELDS.filter(f => f.required).map(f => f.value);
      const missingFields = requiredFields.filter(field => !fieldMapping[field]);
      
      if (missingFields.length > 0) {
        toast({
          title: "Ошибка",
          description: `Выберите поля: ${missingFields.map(f => SYSTEM_FIELDS.find(sf => sf.value === f)?.label).join(", ")}`,
          variant: "destructive",
        });
        return;
      }
      
      saveMappingMutation.mutate(fieldMapping);
    }
  };

  const canProceed = () => {
    if (step === "source") {
      return source === "wordpress" || (source === "csv" && uploadId);
    }
    if (step === "mapping") {
      const requiredFields = SYSTEM_FIELDS.filter(f => f.required).map(f => f.value);
      return requiredFields.every(field => fieldMapping[field]);
    }
    return false;
  };

  const copyApiKey = () => {
    if (apiKeyData?.apiKey) {
      navigator.clipboard.writeText(apiKeyData.apiKey);
      toast({
        title: "Скопировано",
        description: "API ключ скопирован в буфер обмена",
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">Импорт контента - Шаг {step === "source" ? "2" : "2b"}</h2>
          <p className="text-gray-600 mt-1">
            {step === "source" ? "Выберите источник контента" : "Сопоставьте поля для импорта"}
          </p>
        </div>

        <div className="p-6">
          {step === "source" && (
            <div className="space-y-6">
              <RadioGroup value={source || ""} onValueChange={(value) => setSource(value as ImportSource)}>
                {/* CSV/JSON Option */}
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="csv" id="csv" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="csv" className="text-lg font-semibold cursor-pointer">
                      CSV / JSON (рекомендуемый путь)
                    </Label>
                    <div className="mt-2 space-y-3">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex items-center gap-2"
                      >
                        <a href="/static/sample.csv" download>
                          <Download className="h-4 w-4" />
                          Скачать пример CSV
                        </a>
                      </Button>
                      
                      {source === "csv" && (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.json"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <div
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploadMutation.isPending ? (
                              <div className="flex flex-col items-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                                <p className="text-gray-600">Загружаем файл...</p>
                              </div>
                            ) : uploadId ? (
                              <div className="flex flex-col items-center text-green-600">
                                <CheckCircle2 className="h-8 w-8 mb-2" />
                                <p>Файл успешно загружен!</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-lg font-medium">Перетащите файл сюда</p>
                                <p className="text-gray-500">или нажмите для выбора</p>
                                <p className="text-xs text-gray-400 mt-2">CSV или JSON, до 250 МБ</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* WordPress Option */}
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="wordpress" id="wordpress" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="wordpress" className="text-lg font-semibold cursor-pointer">
                      WordPress-плагин
                    </Label>
                    <div className="mt-2 space-y-3">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex items-center gap-2"
                      >
                        <a href="/static/perlinker-wp.zip" download>
                          <Download className="h-4 w-4" />
                          Скачать плагин (.zip)
                        </a>
                      </Button>
                      
                      {source === "wordpress" && (
                        <div className="border rounded-lg p-4 bg-gray-50">
                          <div className="space-y-3">
                            <div>
                              <Label className="text-sm font-medium">API ключ:</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text"
                                  value={apiKeyData?.apiKey || ""}
                                  readOnly
                                  className="flex-1 px-3 py-2 border rounded-md bg-white text-sm font-mono"
                                  placeholder={apiKeyData?.apiKey ? "" : "Генерируем ключ..."}
                                />
                                {apiKeyData?.apiKey ? (
                                  <Button size="sm" variant="outline" onClick={copyApiKey}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    onClick={() => createApiKeyMutation.mutate()}
                                    disabled={createApiKeyMutation.isPending}
                                  >
                                    {createApiKeyMutation.isPending ? "..." : "Создать"}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 flex items-start gap-2">
                              <Plug className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium">Инструкция:</p>
                                <ol className="list-decimal list-inside mt-1 space-y-1">
                                  <li>Установите плагин в WordPress</li>
                                  <li>Вставьте API ключ в настройки плагина</li>
                                  <li>Нажмите "Send all content" в плагине</li>
                                </ol>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === "mapping" && preview && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Предварительный просмотр данных</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {preview.headers.map((header, index) => (
                          <th key={index} className="px-3 py-2 text-left font-medium border-r last:border-r-0">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 border-r last:border-r-0 max-w-32 truncate">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Сопоставление полей</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SYSTEM_FIELDS.filter(field => field.value !== "skip").map((systemField) => (
                    <div key={systemField.value} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        {systemField.label}
                        {systemField.required && <Badge variant="destructive" className="text-xs">Обязательно</Badge>}
                      </Label>
                      <Select 
                        value={fieldMapping[systemField.value] || ""} 
                        onValueChange={(value) => setFieldMapping(prev => ({
                          ...prev,
                          [systemField.value]: value
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите поле" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Не выбрано</SelectItem>
                          {preview.headers.map((header) => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={step === "source" ? onClose : () => setStep("source")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === "source" ? "Отмена" : "Назад"}
          </Button>
          
          <Button 
            onClick={handleNext}
            disabled={!canProceed() || uploadMutation.isPending || saveMappingMutation.isPending}
          >
            {saveMappingMutation.isPending ? "Сохраняем..." : "Далее"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}