// Тест нового алгоритма поиска анкоров
import { db } from './server/db.js';
import { linkCandidates, pagesClean } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';

const runId = '665e98e4-7c77-452d-add1-f6c56aa7603b';

async function testSmartAnchors() {
  console.log('🧪 Тестируем новый алгоритм поиска анкоров...');
  
  try {
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY_2 || process.env.OPENAI_API_KEY 
    });
    
    // Получаем несколько страниц для теста
    const pages = await db
      .select()
      .from(pagesClean)
      .limit(5);
    
    console.log(`📄 Найдено ${pages.length} страниц для тестирования`);
    
    if (pages.length < 2) {
      console.log('❌ Недостаточно страниц для тестирования');
      return;
    }
    
    // Тестируем генерацию анкоров между первыми двумя страницами
    const sourcePage = pages[0];
    const targetPage = pages[1];
    
    console.log(`🔗 Тестируем ссылку: ${sourcePage.url} -> ${targetPage.url}`);
    
    // Извлекаем контент
    const sourceContent = extractMainContent(sourcePage.cleanHtml || '');
    const targetTitle = extractTitle(targetPage.cleanHtml || '');
    
    console.log(`📝 Контент источника: ${sourceContent.substring(0, 200)}...`);
    console.log(`🎯 Заголовок цели: ${targetTitle}`);
    
    // Тестируем поиск анкора в контенте
    const foundAnchor = findAnchorInContent(sourceContent, targetTitle);
    if (foundAnchor) {
      console.log(`✅ Найден анкор в контенте: "${foundAnchor}"`);
    } else {
      console.log(`⚠️ Анкор в контенте не найден, используем AI...`);
    }
    
    // Тестируем OpenAI генерацию
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system", 
          content: "Ты SEO-специалист. Нужно вставить ссылку в текст естественным способом. Либо найди подходящую фразу в тексте, либо предложи как переписать одно предложение, чтобы органично вставить анкор."
        },
        {
          role: "user", 
          content: `ИСХОДНЫЙ ТЕКСТ:\n"${sourceContent.substring(0, 500)}"\n\nТЕМА ССЫЛКИ: "${targetTitle}"\n\nВарианты:\n1. Найди подходящую фразу ИЗ ТЕКСТА для анкора\n2. Или предложи как переписать одно предложение для вставки анкора\n\nФормат ответа:\nТИП: existing/rewrite\nАНКОР: [анкорный текст]\nПРЕДЛОЖЕНИЕ: [если нужно переписать - новое предложение с анкором]`
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const aiResponse = response.choices[0]?.message?.content?.trim();
    console.log(`🤖 Ответ OpenAI:\n${aiResponse}`);
    
    if (aiResponse) {
      const typeMatch = aiResponse.match(/ТИП:\s*(existing|rewrite)/i);
      const anchorMatch = aiResponse.match(/АНКОР:\s*(.+?)(?:\n|$)/i);
      const sentenceMatch = aiResponse.match(/ПРЕДЛОЖЕНИЕ:\s*(.+?)(?:\n|$)/i);
      
      if (anchorMatch) {
        const anchor = anchorMatch[1].trim();
        const type = typeMatch?.[1] || 'existing';
        
        console.log(`📌 Извлеченный анкор: "${anchor}" (тип: ${type})`);
        
        // Сохраняем тестовую ссылку в базу
        await db.insert(linkCandidates).values({
          runId,
          sourcePageId: sourcePage.id,
          targetPageId: targetPage.id,
          sourceUrl: sourcePage.url,
          targetUrl: targetPage.url,
          anchorText: anchor,
          scenario: 'test',
          similarity: 0.8,
          isRejected: false,
          position: 0,
          cssClass: 'seo-link',
          modifiedSentence: type === 'rewrite' && sentenceMatch ? sentenceMatch[1].trim() : null
        });
        
        console.log(`✅ Тестовая ссылка сохранена в базу данных!`);
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

function extractMainContent(html) {
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '').trim();
  
  return 'Без названия';
}

function findAnchorInContent(content, targetTitle) {
  const contentLower = content.toLowerCase();
  const titleWords = targetTitle.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  
  for (const word of titleWords) {
    if (contentLower.includes(word)) {
      const regex = new RegExp(`\\b[^.]*${word}[^.]*\\b`, 'i');
      const match = content.match(regex);
      if (match && match[0].length < 80) {
        return match[0].trim();
      }
    }
  }
  
  return null;
}

testSmartAnchors();