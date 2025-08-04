import { useState, useEffect } from 'react';
import helpContentData from '@/data/helpContent.json';

type HelpContent = {
  title: string;
  description: string;
  content: string;
  videoUrl: string;
};

type Language = 'ru' | 'en';

export function useHelpContent(language: Language = 'ru') {
  const [content, setContent] = useState<Record<string, HelpContent>>(helpContentData[language] || helpContentData.ru);

  useEffect(() => {
    setContent(helpContentData[language] || helpContentData.ru);
  }, [language]);

  const getContent = (key: string): HelpContent | null => {
    return content[key] || null;
  };

  return { getContent };
}