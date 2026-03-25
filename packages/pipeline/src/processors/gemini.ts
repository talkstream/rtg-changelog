import { geminiResponseSchema, geminiDocumentResponseSchema } from '@rtg/shared';
import type { GeminiTranslation, GeminiDocumentResponse } from '@rtg/shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// V1 prompts (title-only translation, kept for backward compatibility)

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

// V2 prompts (full-text PDF extraction and translation)

const DOCUMENT_SYSTEM_PROMPT = `You are translating official Thai government gazette documents.
Your translations must be:
- Complete: every sentence, every clause, every fact preserved
- Accurate: legal terminology precise, no paraphrasing of substance
- Readable: natural English/Russian, not word-for-word machine translation
- Structured: preserve document structure (sections, articles, clauses)`;

const DOCUMENT_USER_PROMPT = `This is a document from the Royal Thai Gazette (ราชกิจจานุเบกษา).

1. Extract the COMPLETE Thai text, preserving all structure (sections, articles, clauses, numbered lists)
2. Translate to English — accurate, complete, no omissions
3. Translate to Russian — accurate, complete, no omissions
4. Provide metadata

Respond as JSON:
{
  "title_th": "...",
  "title_en": "...",
  "title_ru": "...",
  "content_th": "full Thai text with markdown structure",
  "content_en": "full English translation with markdown structure",
  "content_ru": "full Russian translation with markdown structure",
  "document_type": "law|decree|regulation|announcement|order",
  "issuing_authority": "...",
  "effective_date": "YYYY-MM-DD or null",
  "key_terms": ["...", "..."],
  "relevance_score": 1-5,
  "relevance_tags": ["visa","immigration","tax","business",...],
  "summary_en": "1-2 sentence summary for expats or null if score<=2",
  "summary_ru": "same in Russian or null if score<=2"
}`;

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
 * V1: Call Gemini API to translate and categorize a batch of records (title-only)
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

  const parsed = JSON.parse(text);
  const validated = geminiResponseSchema.parse(parsed);

  return { translations: validated, tokensUsed };
}

/**
 * V2: Extract full text from PDF and translate using Gemini multimodal API
 */
export async function extractAndTranslatePdf(
  pdfBase64: string,
  apiKey: string,
  model: string,
): Promise<{ document: GeminiDocumentResponse; tokensUsed: number }> {
  const res = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: DOCUMENT_SYSTEM_PROMPT }] },
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64,
              },
            },
            { text: DOCUMENT_USER_PROMPT },
          ],
        }],
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
  if (!text) throw new Error('Empty Gemini response for PDF extraction');

  const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;

  const parsed = JSON.parse(text);
  const validated = geminiDocumentResponseSchema.parse(parsed);

  return { document: validated, tokensUsed };
}
