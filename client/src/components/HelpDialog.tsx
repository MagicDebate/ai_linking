import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, Play } from "lucide-react";
import { useHelpContent } from "@/hooks/useHelpContent";

interface HelpDialogProps {
  contentKey: string;
  language?: 'ru' | 'en';
}

export function HelpDialog({ contentKey, language = 'ru' }: HelpDialogProps) {
  const { getContent } = useHelpContent(language);
  const content = getContent(contentKey);

  if (!content) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="text-blue-600 p-0">
          <Info className="h-4 w-4 mr-1" />
          Подробнее
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>
            {content.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors">
            <Play className="h-16 w-16 text-gray-400" />
            <span className="ml-2 text-gray-500">Видео-объяснение</span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {content.content}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}