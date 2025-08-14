import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Settings, 
  Link, 
  Target, 
  FileText, 
  Layers, 
  TrendingUp,
  Clock,
  ArrowUp,
  RefreshCw,
  Trash2,
  Code,
  ExternalLink
} from 'lucide-react';

export interface SEOProfile {
  // Лимиты
  maxLinks: number;           // 1-10
  minGap: number;            // 50-400 слов
  exactAnchorPercent: number; // 0-50%
  
  // Стоп-лист и priority/hub URLs
  stopAnchors: string[];
  priorityPages: string[];    // Money pages for Commercial Routing
  hubPages: string[];        // Hub pages for Head Consolidation
  
  // Сценарии ON/OFF + настройки
  scenarios: {
    orphanFix: boolean;
    headConsolidation: boolean;
    clusterCrossLink: boolean;
    commercialRouting: boolean;
    depthLift: {
      enabled: boolean;
      minDepth: number; // 3-8
    };
    freshnessPush: {
      enabled: boolean;
      daysFresh: number; // 7-60
      linksPerDonor: number; // 0-3
    };
  };
  
  // Политики ссылок
  policies: {
    oldLinks: 'enrich' | 'regenerate' | 'audit';
    removeDuplicates: boolean;
    brokenLinks: 'delete' | 'replace' | 'ignore';
  };
  
  // HTML атрибуты
  htmlAttributes: {
    className: string;
    rel: {
      noopener: boolean;
      noreferrer: boolean;
      nofollow: boolean;
    };
    targetBlank: boolean;
    classMode: 'append' | 'replace';
  };
}

const DEFAULT_PROFILE: SEOProfile = {
  maxLinks: 3,
  minGap: 100,
  exactAnchorPercent: 20,
  stopAnchors: [],
  priorityPages: [],
  hubPages: [],
  scenarios: {
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

interface SEOSettingsProps {
  seoProfile: SEOProfile;
  onProfileChange: (profile: SEOProfile) => void;
  onGenerate: () => void;
  isGenerating?: boolean;
}

export function SEOSettings({ 
  seoProfile, 
  onProfileChange, 
  onGenerate, 
  isGenerating = false 
}: SEOSettingsProps) {
  const updateProfile = (updates: Partial<SEOProfile>) => {
    onProfileChange({ ...seoProfile, ...updates });
  };

  const updateScenarios = (updates: Partial<SEOProfile['scenarios']>) => {
    onProfileChange({
      ...seoProfile,
      scenarios: { ...seoProfile.scenarios, ...updates }
    });
  };

  const updatePolicies = (updates: Partial<SEOProfile['policies']>) => {
    onProfileChange({
      ...seoProfile,
      policies: { ...seoProfile.policies, ...updates }
    });
  };

  const updateHtmlAttributes = (updates: Partial<SEOProfile['htmlAttributes']>) => {
    onProfileChange({
      ...seoProfile,
      htmlAttributes: { ...seoProfile.htmlAttributes, ...updates }
    });
  };

  return (
    <div className="space-y-6">
      {/* Сценарии - НА ПЕРВОМ МЕСТЕ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Сценарии генерации
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Простые сценарии */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { 
                key: 'orphanFix', 
                title: 'Orphan Fix', 
                desc: 'Исправление сиротских страниц',
                icon: <FileText className="h-4 w-4" />
              },
              { 
                key: 'headConsolidation', 
                title: 'Head Consolidation', 
                desc: 'Консолидация главных страниц',
                icon: <Target className="h-4 w-4" />
              },
              { 
                key: 'clusterCrossLink', 
                title: 'Cluster Cross-Link', 
                desc: 'Перекрестные ссылки в кластерах',
                icon: <Link className="h-4 w-4" />
              },
              { 
                key: 'commercialRouting', 
                title: 'Commercial Routing', 
                desc: 'Маршрутизация на коммерческие страницы',
                icon: <TrendingUp className="h-4 w-4" />
              }
            ].map((scenario) => (
              <div key={scenario.key} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  {scenario.icon}
                  <div>
                    <h5 className="font-medium">{scenario.title}</h5>
                    <p className="text-sm text-gray-600">{scenario.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={seoProfile.scenarios[scenario.key as keyof typeof seoProfile.scenarios] as boolean}
                  onCheckedChange={(checked) => updateScenarios({ [scenario.key]: checked })}
                />
              </div>
            ))}
          </div>

          {/* Depth Lift */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ArrowUp className="h-4 w-4" />
                <div>
                  <h5 className="font-medium">Depth Lift</h5>
                  <p className="text-sm text-gray-600">Поднятие глубоких страниц</p>
                </div>
              </div>
              <Switch
                checked={seoProfile.scenarios.depthLift.enabled}
                onCheckedChange={(checked) => updateScenarios({ 
                  depthLift: { ...seoProfile.scenarios.depthLift, enabled: checked }
                })}
              />
            </div>
            {seoProfile.scenarios.depthLift.enabled && (
              <div className="ml-7">
                <Label htmlFor="minDepth">Минимальная глубина</Label>
                <Select 
                  value={seoProfile.scenarios.depthLift.minDepth.toString()} 
                  onValueChange={(value) => updateScenarios({
                    depthLift: { ...seoProfile.scenarios.depthLift, minDepth: parseInt(value) }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3,4,5,6,7,8].map(num => (
                      <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Freshness Push */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4" />
                <div>
                  <h5 className="font-medium">Freshness Push</h5>
                  <p className="text-sm text-gray-600">Продвижение свежего контента</p>
                </div>
              </div>
              <Switch
                checked={seoProfile.scenarios.freshnessPush.enabled}
                onCheckedChange={(checked) => updateScenarios({ 
                  freshnessPush: { ...seoProfile.scenarios.freshnessPush, enabled: checked }
                })}
              />
            </div>
            {seoProfile.scenarios.freshnessPush.enabled && (
              <div className="ml-7 space-y-4">
                <div>
                  <Label>Свежесть: {seoProfile.scenarios.freshnessPush.daysFresh} дней</Label>
                  <Slider
                    value={[seoProfile.scenarios.freshnessPush.daysFresh]}
                    onValueChange={([value]) => updateScenarios({
                      freshnessPush: { ...seoProfile.scenarios.freshnessPush, daysFresh: value }
                    })}
                    min={7}
                    max={60}
                    step={1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Ссылок на донора: {seoProfile.scenarios.freshnessPush.linksPerDonor}</Label>
                  <Slider
                    value={[seoProfile.scenarios.freshnessPush.linksPerDonor]}
                    onValueChange={([value]) => updateScenarios({
                      freshnessPush: { ...seoProfile.scenarios.freshnessPush, linksPerDonor: value }
                    })}
                    min={0}
                    max={3}
                    step={1}
                    className="mt-2"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Основные параметры */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Основные параметры
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Лимиты */}
          <div className="space-y-4">
            <h5 className="text-sm font-medium text-gray-800">Лимиты</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label>Максимум ссылок на страницу: {seoProfile.maxLinks}</Label>
                <Slider
                  value={[seoProfile.maxLinks]}
                  onValueChange={([value]) => updateProfile({ maxLinks: value })}
                  min={1}
                  max={10}
                  step={1}
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label>Минимальное расстояние: {seoProfile.minGap} слов</Label>
                <Slider
                  value={[seoProfile.minGap]}
                  onValueChange={([value]) => updateProfile({ minGap: value })}
                  min={50}
                  max={400}
                  step={10}
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label>Точные анкоры: {seoProfile.exactAnchorPercent}%</Label>
                <Slider
                  value={[seoProfile.exactAnchorPercent]}
                  onValueChange={([value]) => updateProfile({ exactAnchorPercent: value })}
                  min={0}
                  max={50}
                  step={5}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          {/* Стоп-лист анкоров */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="stopAnchors">Стоп-лист анкоров</Label>
              <Textarea
                id="stopAnchors"
                value={seoProfile.stopAnchors.join(', ')}
                onChange={(e) => {
                  const anchors = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                  updateProfile({ stopAnchors: anchors });
                }}
                placeholder="Введите якоря через запятую"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Слова, которые не должны использоваться как анкоры</p>
            </div>
          </div>

          {/* Priority Pages - видно только если Commercial Routing включен */}
          {seoProfile.scenarios.commercialRouting && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="priorityPages">Priority Pages (Money Pages)</Label>
                <Textarea
                  id="priorityPages"
                  value={seoProfile.priorityPages.join(', ')}
                  onChange={(e) => {
                    const urls = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                    updateProfile({ priorityPages: urls });
                  }}
                  placeholder="Введите URL через запятую"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Коммерческие страницы для Commercial Routing</p>
              </div>
            </div>
          )}

          {/* Hub Pages - видно только если Head Consolidation включен */}
          {seoProfile.scenarios.headConsolidation && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="hubPages">Hub Pages</Label>
                <Textarea
                  id="hubPages"
                  value={seoProfile.hubPages.join(', ')}
                  onChange={(e) => {
                    const urls = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                    updateProfile({ hubPages: urls });
                  }}
                  placeholder="Введите URL через запятую"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Канонические/хаб-страницы для Head Consolidation</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Политики ссылок */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Политики ссылок
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Старые ссылки</Label>
              <Select
                value={seoProfile.policies.oldLinks}
                onValueChange={(value: 'enrich' | 'regenerate' | 'audit') => 
                  updatePolicies({ oldLinks: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enrich">Обогатить</SelectItem>
                  <SelectItem value="regenerate">Перегенерировать</SelectItem>
                  <SelectItem value="audit">Аудит</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Битые ссылки</Label>
              <Select
                value={seoProfile.policies.brokenLinks}
                onValueChange={(value: 'delete' | 'replace' | 'ignore') => 
                  updatePolicies({ brokenLinks: value })
                }
              >
                <SelectTrigger className="mt-1">
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
          
          <div className="flex items-center space-x-2">
            <Switch
              checked={seoProfile.policies.removeDuplicates}
              onCheckedChange={(checked) => updatePolicies({ removeDuplicates: checked })}
            />
            <Label>Удалять дубликаты</Label>
          </div>
        </CardContent>
      </Card>

      {/* HTML атрибуты */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            HTML атрибуты
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="className">CSS класс</Label>
              <Input
                id="className"
                value={seoProfile.htmlAttributes.className}
                onChange={(e) => updateHtmlAttributes({ className: e.target.value })}
                placeholder="my-link-class"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Режим класса</Label>
              <Select
                value={seoProfile.htmlAttributes.classMode}
                onValueChange={(value: 'append' | 'replace') => 
                  updateHtmlAttributes({ classMode: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Добавить</SelectItem>
                  <SelectItem value="replace">Заменить</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={seoProfile.htmlAttributes.targetBlank}
                onCheckedChange={(checked) => updateHtmlAttributes({ targetBlank: checked })}
              />
              <Label className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Открывать в новой вкладке
              </Label>
            </div>
            
            <div className="space-y-2">
              <Label>Атрибуты rel</Label>
              <div className="space-y-2">
                {[
                  { key: 'noopener', label: 'noopener' },
                  { key: 'noreferrer', label: 'noreferrer' },
                  { key: 'nofollow', label: 'nofollow' }
                ].map((rel) => (
                  <div key={rel.key} className="flex items-center space-x-2">
                    <Switch
                      checked={seoProfile.htmlAttributes.rel[rel.key as keyof typeof seoProfile.htmlAttributes.rel]}
                      onCheckedChange={(checked) => updateHtmlAttributes({
                        rel: { ...seoProfile.htmlAttributes.rel, [rel.key]: checked }
                      })}
                    />
                    <Label>{rel.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Кнопка генерации */}
      <div className="flex justify-center">
        <Button 
          onClick={onGenerate}
          disabled={isGenerating}
          size="lg"
          className="px-8"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <Link className="h-4 w-4 mr-2" />
              Начать генерацию ссылок
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
