import type { Series, Lang } from './types.js';

// Thai series character → Latin series letter
export const SERIES_MAP: Record<string, Series> = {
  'ก': 'A',
  'ข': 'B',
  'ค': 'C',
  'ง': 'D',
};

export const SERIES_NAMES: Record<Lang, Record<Series, string>> = {
  en: {
    A: 'Legislation',
    B: 'Title Registers',
    C: 'Trade Registers',
    D: 'General Announcements',
  },
  ru: {
    A: 'Законодательство',
    B: 'Реестр титулов',
    C: 'Торговый реестр',
    D: 'Общие объявления',
  },
  th: {
    A: 'กฎหมาย',
    B: 'ทะเบียนฐานันดร',
    C: 'ทะเบียนการค้า',
    D: 'ประกาศและงานทั่วไป',
  },
};

export const SUPPORTED_LANGS: Lang[] = ['en', 'th', 'ru'];
export const DEFAULT_LANG: Lang = 'en';

export const RELEVANCE_TAGS = [
  'visa', 'immigration', 'tax', 'business', 'property', 'labor',
  'education', 'health', 'finance', 'trade', 'customs', 'environment',
  'transport', 'digital', 'legal',
] as const;

export const MIN_DATE = '2026-01-01'; // Only 2026 content
