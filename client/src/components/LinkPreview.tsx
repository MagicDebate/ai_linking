import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ExternalLink, 
  FileText, 
  Target, 
  Link, 
  TrendingUp, 
  ArrowUp, 
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface LinkCandidate {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  type: string;
  status: string;
  anchorSource: string;
  confidence: number;
  modifiedSentence: string | null;
  similarity: number;
  createdAt: string;
}

interface LinkPreviewProps {
  candidate: LinkCandidate;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

const typeConfig = {
  orphan_fix: {
    title: 'Orphan Fix',
    description: 'Исправление «сиротских» страниц',
    icon: <FileText className="h-4 w-4" />,
    color: 'bg-blue-500'
  },
  head_consolidation: {
    title: 'Head Consolidation',
    description: 'Консолидация заголовков',
    icon: <Target className="h-4 w-4" />,
    color: 'bg-green-500'
  },
  cluster_cross_link: {
    title: 'Cluster Cross-Link',
    description: 'Перелинковка внутри кластеров',
    icon: <Link className="h-4 w-4" />,
    color: 'bg-purple-500'
  },
  commercial_routing: {
    title: 'Commercial Routing',
    description: 'Перелив на Money Pages',
    icon: <TrendingUp className="h-4 w-4" />,
    color: 'bg-orange-500'
  },
  depth_lift: {
    title: 'Depth Lift',
    description: 'Поднятие глубоко вложенных страниц',
    icon: <ArrowUp className="h-4 w-4" />,
    color: 'bg-indigo-500'
  },
  freshness_push: {
    title: 'Freshness Push',
    description: 'Подсветка свежего контента',
    icon: <RefreshCw className="h-4 w-4" />,
    color: 'bg-pink-500'
  }
};

const anchorSourceConfig = {
  text: { label: 'Естественный', color: 'bg-green-100 text-green-800' },
  ai: { label: 'ИИ', color: 'bg-blue-100 text-blue-800' },
  generic: { label: 'Fallback', color: 'bg-gray-100 text-gray-800' }
};

export function LinkPreview({ candidate, onApprove, onReject }: LinkPreviewProps) {
  const typeInfo = typeConfig[candidate.type as keyof typeof typeConfig] || {
    title: candidate.type,
    description: 'Неизвестный тип',
    icon: <Link className="h-4 w-4" />,
    color: 'bg-gray-500'
  };

  const sourceInfo = anchorSourceConfig[candidate.anchorSource as keyof typeof anchorSourceConfig] || {
    label: candidate.anchorSource,
    color: 'bg-gray-100 text-gray-800'
  };

  const getStatusIcon = () => {
    switch (candidate.status) {
      case 'accepted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'flagged':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded ${typeInfo.color} text-white`}>
              {typeInfo.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{typeInfo.title}</CardTitle>
              <p className="text-sm text-gray-600">{typeInfo.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant="outline">{candidate.status}</Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Ссылки */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Страница-донор:</h4>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <a 
                href={candidate.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm truncate"
              >
                {candidate.sourceUrl}
              </a>
              <ExternalLink className="h-3 w-3 text-gray-400" />
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Целевая страница:</h4>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-500" />
              <a 
                href={candidate.targetUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm truncate"
              >
                {candidate.targetUrl}
              </a>
              <ExternalLink className="h-3 w-3 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Анкор */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Анкор:</h4>
          <div className="flex items-center gap-2">
            <Badge className={sourceInfo.color}>
              {sourceInfo.label}
            </Badge>
            <span className="text-lg font-medium">"{candidate.anchorText}"</span>
          </div>
        </div>

        {/* Переписанное предложение */}
        {candidate.modifiedSentence && (
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Переписанное предложение:</h4>
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div 
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ 
                  __html: candidate.modifiedSentence.replace(
                    /<a href="([^"]+)">([^<]+)<\/a>/g,
                    '<a href="$1" class="text-blue-600 underline font-medium" target="_blank">$2</a>'
                  )
                }}
              />
            </div>
          </div>
        )}

        {/* Метаданные */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Уверенность:</span>
            <div className="font-medium">{Math.round(candidate.confidence * 100)}%</div>
          </div>
          <div>
            <span className="text-gray-600">Схожесть:</span>
            <div className="font-medium">{Math.round(candidate.similarity * 100)}%</div>
          </div>
          <div>
            <span className="text-gray-600">Источник:</span>
            <div className="font-medium">{sourceInfo.label}</div>
          </div>
          <div>
            <span className="text-gray-600">Создано:</span>
            <div className="font-medium">
              {new Date(candidate.createdAt).toLocaleString('ru-RU')}
            </div>
          </div>
        </div>

        {/* Действия */}
        {candidate.status === 'accepted' && (
          <div className="flex gap-2 pt-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onReject?.(candidate.id)}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Отклонить
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => window.open(candidate.targetUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Открыть цель
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
