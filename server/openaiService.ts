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
      const prompt = `
Ты - SEO-специалист. Нужно создать естественный анкор для ссылки.

Исходный текст: "${sourceText}"

Целевая страница:
- Заголовок: "${targetTitle}"
- Описание: "${targetDescription}"

Задача: Найди в исходном тексте фразу 2-6 слов, которая лучше всего описывает тему целевой страницы. 
Если такой фразы нет - создай короткую фразу (не более ${maxWords} слов).

Требования:
- Только текст анкора, без HTML
- Естественный язык
- Не используй стоп-фразы: "читать далее", "подробнее", "здесь", "жмите сюда", "click here", "learn more"
- Не добавляй кавычки

Ответь только текстом анкора:
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
      
      if (!anchorText) {
        throw new Error('Empty response from OpenAI');
      }

      // Очищаем от кавычек и лишних символов
      const cleanAnchor = anchorText.replace(/^["']|["']$/g, '').trim();
      
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
}

export const openaiService = new OpenAIService();
