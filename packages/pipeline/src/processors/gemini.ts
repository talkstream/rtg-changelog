import { geminiResponseSchema } from '@rtg/shared';
import type { GeminiTranslation, SourceRecord } from '@rtg/shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You are a legal translation specialist for the Royal Thai Gazette (ราชกิจจานุเบกษา). Your audience is adult expats and business foreigners living in Thailand. Produce precise, formal but accessible translations.

Rules:
- Translate titles accurately, keeping legal terminology precise but understandable
- For relevance scoring, consider impact on foreign residents, business owners, and workers
- Summaries should explain practical impact in plain language
- If a title clearly relates to internal Thai government operations with no foreign impact, score 1
- If uncertain about relevance, err on the side of higher score`;

const USER_PROMPT_TEMPLATE = `Process these Royal Thai Gazette records. For each record, provide:
1. English title (formal but accessible)
2. Russian title (formal but accessible)
3. Relevance score (1-5) for foreign residents/businesses in Thailand:
   1 = Irrelevant (internal Thai government, royal titles/decorations)
   2 = Low (minor regulatory changes)
   3 = Medium (may affect foreigners indirectly)
   4 = High (directly affects foreign business, visas, permits, property)
   5 = Critical (immigration law, tax changes, major business law)
4. Relevance tags from: [visa, immigration, tax, business, property, labor, education, health, finance, trade, customs, environment, transport, digital, legal]
5. "What this means for you" summary in English (1-2 sentences, max 100 words). Set null if relevance_score <= 2.
6. Same summary in Russian. Set null if relevance_score <= 2.

Records:
RECORDS_PLACEHOLDER

Respond ONLY with a JSON array, no markdown fences:
[{"id":"...","title_en":"...","title_ru":"...","relevance_score":N,"relevance_tags":["..."],"summary_en":"..." or null,"summary_ru":"..." or null}]`;

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Call Gemini API to translate and categorize a batch of records
 */
export async function translateBatch(
  records: Array<{ id: string; title_th: string; series: string; published_date: string }>,
  apiKey: string,
  model: string,
): Promise<{ translations: GeminiTranslation[]; tokensUsed: number }> {
  const recordsJson = JSON.stringify(
    records.map((r) => ({
      id: r.id,
      title_th: r.title_th,
      series: r.series,
      date: r.published_date,
    })),
  );

  const userPrompt = USER_PROMPT_TEMPLATE.replace('RECORDS_PLACEHOLDER', recordsJson);

  const res = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as GeminiApiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');

  const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;

  // Parse and validate response
  const parsed = JSON.parse(text);
  const validated = geminiResponseSchema.parse(parsed);

  return { translations: validated, tokensUsed };
}
