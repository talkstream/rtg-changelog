import en from './en.json';
import th from './th.json';
import ru from './ru.json';
import type { Lang } from '@rtg/shared';

const translations: Record<Lang, Record<string, string>> = { en, th, ru };

export function t(locale: Lang, key: string): string {
  return translations[locale]?.[key] ?? translations.en[key] ?? key;
}

export function getLangFromUrl(url: URL): Lang {
  const seg = url.pathname.split('/')[1];
  if (seg === 'th' || seg === 'ru' || seg === 'en') return seg;
  return 'en';
}

export function localePath(lang: Lang, path: string): string {
  return `/${lang}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatDate(dateStr: string, lang: Lang): string {
  const date = new Date(dateStr + 'T00:00:00');
  const locale = lang === 'th' ? 'th-TH' : lang === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
