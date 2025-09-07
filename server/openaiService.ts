import OpenAI from 'openai';

// Инициализация OpenAI клиента
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  
  // Генерация анкора через ИИ
  async generateAnchorText(
    sourceText: string, 
    targetTitle: string, 
    targetDescription: string,
    maxWords: number = 8
  ): Promise<string> {
    try {
      // Детальное логирование входных данных
      console.log('🤖 [OpenAI] Anchor generation input:');
      console.log('  - Source text length:', sourceText.length);
      console.log('  - Source text preview:', sourceText.substring(0, 100) + '...');
      console.log('  - Target title:', targetTitle);
      console.log('  - Target description:', targetDescription);
      console.log('  - Max words:', maxWords);

      // Проверяем качество входных данных
      if (!sourceText || sourceText.trim().length < 10) {
        console.log('⚠️ [OpenAI] Source text too short, using fallback');
        return this.generateFallbackAnchor(targetTitle);
      }

      if (!targetTitle || targetTitle.trim().length < 3) {
        console.log('⚠️ [OpenAI] Target title too short, using fallback');
        return this.generateFallbackAnchor(targetTitle);
      }

      const prompt = `
Ты - эксперт по SEO и внутренней перелинковке. Создай естественный анкор для ссылки.

КОНТЕКСТ:
Исходный текст (где будет размещена ссылка): "${sourceText}"

ЦЕЛЕВАЯ СТРАНИЦА:
- Заголовок: "${targetTitle}"
- Описание: "${targetDescription}"

ЗАДАЧА:
1. Найди в исходном тексте фразу 2-6 слов, которая логично связана с темой целевой страницы
2. Если такой фразы нет - создай короткую фразу (не более ${maxWords} слов) на основе заголовка целевой страницы

КРИТЕРИИ КАЧЕСТВА:
- Анкор должен быть релевантен теме целевой страницы
- Должен естественно вписываться в исходный текст
- Не используй общие фразы: "читать далее", "подробнее", "здесь", "жмите сюда", "click here", "learn more"
- Не добавляй кавычки или HTML
- Используй только русский язык

ПРИМЕРЫ ХОРОШИХ АНКОРОВ:
- "панические атаки" (для страницы о лечении панических атак)
- "симптомы депрессии" (для страницы о депрессии)
- "лечение тревожности" (для страницы о тревожных расстройствах)

Ответь ТОЛЬКО текстом анкора без дополнительных объяснений:
`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Ты - SEO-специалист, создающий естественные анкоры для ссылок." },
          { role: "user", content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.3,
      });

      const anchorText = response.choices[0]?.message?.content?.trim();
      
      console.log('🤖 [OpenAI] Raw response:', anchorText);
      
      if (!anchorText) {
        throw new Error('Empty response from OpenAI');
      }

      // Очищаем от кавычек и лишних символов
      const cleanAnchor = anchorText.replace(/^["']|["']$/g, '').trim();
      
      console.log('🤖 [OpenAI] Cleaned anchor:', cleanAnchor);
      
      // Валидация качества анкора
      if (!this.isValidAnchor(cleanAnchor)) {
        console.log('⚠️ [OpenAI] Generated anchor failed validation, using fallback');
        return this.generateFallbackAnchor(targetTitle);
      }
      
      return cleanAnchor;
    } catch (error) {
      console.error('❌ OpenAI anchor generation failed:', error);
      throw error;
    }
  }

  // Рерайт предложения с вставкой ссылки
  async rewriteSentenceWithLink(
    sentence: string,
    targetTitle: string,
    targetDescription: string,
    anchorText: string
  ): Promise<string> {
    try {
      const prompt = `
Ты - SEO-специалист. Нужно переписать предложение, органично вставив ссылку.

Исходное предложение: "${sentence}"

Целевая страница:
- Заголовок: "${targetTitle}"
- Описание: "${targetDescription}"

Анкор для ссылки: "${anchorText}"

Задача: Перепиши предложение, заменив анкор на ссылку <a href="URL">${anchorText}</a>
Ссылка должна быть органично вписана в текст, не нарушая смысл.

Требования:
- Сохрани смысл предложения
- Ссылка должна выглядеть естественно
- Не добавляй лишние слова
- Верни только переписанное предложение с HTML-ссылкой

Ответь только переписанным предложением:
`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Ты - SEO-специалист, переписывающий предложения с вставкой ссылок." },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const rewrittenSentence = response.choices[0]?.message?.content?.trim();
      
      if (!rewrittenSentence) {
        throw new Error('Empty response from OpenAI');
      }

      return rewrittenSentence;
    } catch (error) {
      console.error('❌ OpenAI sentence rewrite failed:', error);
      throw error;
    }
  }

  // Проверка качества анкора
  validateAnchorText(anchorText: string, stopAnchors: string[]): boolean {
    const lowerAnchor = anchorText.toLowerCase();
    
    // Проверка длины
    const words = anchorText.split(/\s+/).filter(word => word.length > 0);
    if (words.length < 2 || words.length > 8) {
      return false;
    }
    
    // Проверка стоп-анкоров
    for (const stopAnchor of stopAnchors) {
      if (lowerAnchor.includes(stopAnchor.toLowerCase())) {
        return false;
      }
    }
    
    // Проверка на бренд-галлюцинации
    const brandPatterns = [
      /evolucionika/i,
      /наш сайт/i,
      /наша компания/i,
      /мы предлагаем/i
    ];
    
    for (const pattern of brandPatterns) {
      if (pattern.test(anchorText)) {
        return false;
      }
    }
    
    return true;
  }

  // Валидация качества сгенерированного анкора
  private isValidAnchor(anchor: string): boolean {
    if (!anchor || anchor.length < 2 || anchor.length > 100) {
      return false;
    }

    // Проверяем на общие стоп-фразы
    const stopPhrases = [
      'читать далее', 'подробнее', 'здесь', 'жмите сюда', 'click here', 'learn more',
      'далее', 'больше', 'еще', 'также', 'кроме того', 'в том числе', 'подробнее читайте',
      'узнать больше', 'больше информации', 'дополнительная информация'
    ];

    const lowerAnchor = anchor.toLowerCase();
    for (const phrase of stopPhrases) {
      if (lowerAnchor.includes(phrase)) {
        return false;
      }
    }

    // Проверяем что анкор содержит осмысленные слова (не только предлоги/союзы)
    const words = anchor.split(/\s+/).filter(word => word.length > 2);
    if (words.length < 1) {
      return false;
    }

    // Проверяем что анкор не содержит только HTML или технические символы
    if (/^[<>&"']+$/.test(anchor) || /^[0-9\s\-_]+$/.test(anchor)) {
      return false;
    }

    return true;
  }

  // Fallback генерация анкора
  private generateFallbackAnchor(targetTitle: string): string {
    if (!targetTitle || targetTitle.trim().length < 3) {
      return 'подробнее';
    }

    // Извлекаем ключевые слова из заголовка
    const words = targetTitle.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/^(для|при|после|перед|во|в|на|с|из|от|до|за|под|над|между|среди|через|без|кроме|вместо|благодаря|согласно|вопреки|несмотря|наряду|вместе|помимо|кроме|включая|исключая|начиная|кончая|заканчивая|продолжая|останавливая|прекращая|начинающий|кончающий|заканчивающий|продолжающий|останавливающий|прекращающий)$/i.test(word))
      .slice(0, 4);

    if (words.length >= 2) {
      return words.join(' ');
    }

    // Если не получилось - используем заголовок целиком (обрезанный)
    return targetTitle.length > 50 ? targetTitle.substring(0, 50) + '...' : targetTitle;
  }
}

export const openaiService = new OpenAIService();






