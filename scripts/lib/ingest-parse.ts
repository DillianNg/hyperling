import type { GlossaryEntry, PartOfSpeech } from '../../src/core/content/schema.js';

/**
 * Pure parsing helpers shared by content:ingest and its tests. Kept out of the
 * CLI file so importing them does not run the command.
 */

/** Spreadsheet header -> canonical key. Compared after lowercasing and trimming. */
export const HEADER_ALIASES: Record<string, string> = {
  id: 'stableKey',
  stablekey: 'stableKey',
  'cấp độ': 'level',
  level: 'level',
  'chủ đề': 'topic',
  topic: 'topic',
  'loại câu': 'sentenceType',
  sentencetype: 'sentenceType',
  'điểm ngữ pháp': 'grammarNote',
  grammarnote: 'grammarNote',
  'câu tiếng đức': 'text',
  'câu tiếng anh': 'text',
  'câu tiếng pháp': 'text',
  câu: 'text',
  text: 'text',
  'phiên âm (đọc theo tiếng việt)': 'transliteration',
  'phiên âm ipa (chuẩn duden)': 'transliteration',
  'phiên âm ipa': 'transliteration',
  ipa: 'transliteration',
  'phiên âm': 'transliteration',
  transliteration: 'transliteration',
  'nghĩa tiếng việt': 'meaning',
  nghĩa: 'meaning',
  meaning: 'meaning',
  'từ mới trong câu': 'newWords',
  'từ mới': 'newWords',
  newwords: 'newWords',
  glossary: 'newWords',
};

/** Vietnamese sentence-type labels -> canonical slugs, matching xlsx-to-content.py. */
export const SENTENCE_TYPES: Record<string, string> = {
  'câu trần thuật': 'declarative',
  'câu hỏi': 'question',
  'câu hỏi ja/nein': 'yes_no_question',
  'câu phủ định': 'negative',
  'mệnh lệnh': 'imperative',
  'câu cảm thán': 'exclamation',
  'câu ghép': 'compound',
  'câu phụ': 'subordinate',
  'câu trả lời': 'answer',
  'câu bị động': 'passive',
  'liệt kê': 'enumeration',
};

/**
 * Articles that mark noun gender, taken from the course's own `glossaryFields`
 * declaration rather than hardcoded. German declares der/die/das, French le/la,
 * Spanish el/la — the parser has no opinion about which language it is reading.
 */
export type GenderArticles = readonly string[];

export function norm(value: string | undefined | null): string {
  return (value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function canonicalHeader(header: string): string {
  const key = norm(header).toLowerCase();
  return HEADER_ALIASES[key] ?? key;
}

/**
 * Parse the free-text glossary column, e.g. `der Morgen = buổi sáng; gut = tốt`.
 * Noun gender is read off the leading article when it is one the course declared,
 * so the same parser handles `der Tag`, `le jour` and `el día`.
 * Entries without a `=` are reported, not guessed.
 */
export function parseGlossary(
  raw: string,
  genderArticles: GenderArticles = [],
): { entries: GlossaryEntry[]; malformed: string[] } {
  const articles = new Set(genderArticles.map((a) => a.toLowerCase()));
  const entries: GlossaryEntry[] = [];
  const malformed: string[] = [];

  for (const part of raw.split(';')) {
    const chunk = norm(part);
    if (!chunk) continue;

    const separator = chunk.indexOf('=');
    if (separator === -1) {
      malformed.push(chunk);
      continue;
    }

    const term = norm(chunk.slice(0, separator));
    const meaning = norm(chunk.slice(separator + 1));
    if (!term || !meaning) {
      malformed.push(chunk);
      continue;
    }

    const leadingWord = term.split(' ')[0]?.toLowerCase() ?? '';
    // A term that starts with one of the course's gender articles is a noun.
    const gender = articles.has(leadingWord) ? leadingWord : null;
    const partOfSpeech: PartOfSpeech = gender ? 'noun' : 'other';

    entries.push({ term, meaning, partOfSpeech, fields: gender ? { gender } : {} });
  }

  return { entries, malformed };
}

/** `S0601` -> 601. Used as the teaching order, so ids must stay numeric and ordered. */
export function orderIndexFromStableKey(stableKey: string): number | null {
  const match = /^[A-Za-z](\d+)$/.exec(stableKey.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}
