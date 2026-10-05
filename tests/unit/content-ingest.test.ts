import { describe, expect, it } from 'vitest';
import {
  canonicalHeader,
  norm,
  orderIndexFromStableKey,
  parseGlossary,
} from '../../scripts/lib/ingest-parse.js';

/**
 * The ingest path is how the remaining 1200 sentences will arrive, so its parsing
 * rules are tested directly rather than only through the CLI.
 */

describe('canonicalHeader', () => {
  it('nhận cả tên cột tiếng Việt trong file Excel gốc', () => {
    expect(canonicalHeader('ID')).toBe('stableKey');
    expect(canonicalHeader('Câu tiếng Đức')).toBe('text');
    expect(canonicalHeader('Phiên âm (đọc theo tiếng Việt)')).toBe('transliteration');
    expect(canonicalHeader('Nghĩa tiếng Việt')).toBe('meaning');
    expect(canonicalHeader('Từ mới trong câu')).toBe('newWords');
    expect(canonicalHeader('Điểm ngữ pháp')).toBe('grammarNote');
    expect(canonicalHeader('Cấp độ')).toBe('level');
  });

  it('nhận cả key canonical và bỏ qua khác biệt hoa/thường, khoảng trắng', () => {
    expect(canonicalHeader('  stableKey ')).toBe('stableKey');
    expect(canonicalHeader('TEXT')).toBe('text');
    expect(canonicalHeader('Meaning')).toBe('meaning');
  });

  it('giữ nguyên cột lạ để validate báo cảnh báo sau', () => {
    expect(canonicalHeader('Ghi chú riêng')).toBe('ghi chú riêng');
  });
});

describe('norm', () => {
  it('gộp khoảng trắng và giữ dấu tiếng Việt lẫn ký tự Đức', () => {
    expect(norm('  Guten   Morgen!  ')).toBe('Guten Morgen!');
    expect(norm('Tôi  không  được  khỏe')).toBe('Tôi không được khỏe');
    expect(norm('Grüße\tschön')).toBe('Grüße schön');
  });

  it('trả về chuỗi rỗng cho null/undefined', () => {
    expect(norm(undefined)).toBe('');
    expect(norm(null)).toBe('');
  });
});

/** Articles each course declares in its own course.json glossaryFields. */
const DE_ARTICLES = ['der', 'die', 'das'];
const FR_ARTICLES = ['le', 'la', "l'", 'les'];

describe('parseGlossary', () => {
  it('tách đúng định dạng "từ = nghĩa; từ = nghĩa" của file gốc', () => {
    const { entries, malformed } = parseGlossary('der Morgen = buổi sáng; gut = tốt', DE_ARTICLES);
    expect(malformed).toEqual([]);
    expect(entries).toEqual([
      { term: 'der Morgen', meaning: 'buổi sáng', partOfSpeech: 'noun', fields: { gender: 'der' } },
      { term: 'gut', meaning: 'tốt', partOfSpeech: 'other', fields: {} },
    ]);
  });

  it('suy ra giống danh từ từ mạo từ mà khóa học khai báo', () => {
    const { entries } = parseGlossary(
      'die Karte = tấm thẻ; das Geschenk = món quà; der Tag = ngày',
      DE_ARTICLES,
    );
    expect(entries.map((e) => e.fields.gender)).toEqual(['die', 'das', 'der']);
    expect(entries.every((e) => e.partOfSpeech === 'noun')).toBe(true);
  });

  it('cùng một parser nhận mạo từ tiếng Pháp — engine không biết ngôn ngữ nào', () => {
    const { entries } = parseGlossary('le jour = ngày; la gare = nhà ga; aller = đi', FR_ARTICLES);
    expect(entries.map((e) => e.fields.gender)).toEqual(['le', 'la', undefined]);
    expect(entries.map((e) => e.partOfSpeech)).toEqual(['noun', 'noun', 'other']);
  });

  it('không khai báo mạo từ nào thì không suy giống cho từ nào', () => {
    const { entries } = parseGlossary('der Morgen = buổi sáng', []);
    expect(entries[0]!.fields.gender).toBeUndefined();
    expect(entries[0]!.partOfSpeech).toBe('other');
  });

  it('mạo từ của ngôn ngữ khác không bị nhận nhầm', () => {
    // "le" là mạo từ tiếng Pháp, không phải tiếng Đức.
    const { entries } = parseGlossary('le jour = ngày', DE_ARTICLES);
    expect(entries[0]!.fields.gender).toBeUndefined();
  });

  it('báo lại mục thiếu dấu "=" thay vì đoán', () => {
    const { entries, malformed } = parseGlossary('gut = tốt; thiếu dấu bằng; schön = đẹp', DE_ARTICLES);
    expect(entries).toHaveLength(2);
    expect(malformed).toEqual(['thiếu dấu bằng']);
  });

  it('báo lại mục chỉ có một nửa', () => {
    const { entries, malformed } = parseGlossary('= chỉ có nghĩa; từ không nghĩa =', DE_ARTICLES);
    expect(entries).toEqual([]);
    expect(malformed).toEqual(['= chỉ có nghĩa', 'từ không nghĩa =']);
  });

  it('bỏ qua dấu ; thừa và chuỗi rỗng', () => {
    expect(parseGlossary('', DE_ARTICLES).entries).toEqual([]);
    expect(parseGlossary(';;;', DE_ARTICLES).entries).toEqual([]);
    expect(parseGlossary('gut = tốt;', DE_ARTICLES).entries).toHaveLength(1);
  });

  it('giữ nguyên dấu "=" nằm trong phần nghĩa', () => {
    const { entries } = parseGlossary('gleich = bằng = ngang nhau', DE_ARTICLES);
    expect(entries[0]).toMatchObject({ term: 'gleich', meaning: 'bằng = ngang nhau' });
  });
});

describe('orderIndexFromStableKey', () => {
  it('lấy số thứ tự từ ID ổn định', () => {
    expect(orderIndexFromStableKey('S0001')).toBe(1);
    expect(orderIndexFromStableKey('S0601')).toBe(601);
    expect(orderIndexFromStableKey('S1800')).toBe(1800);
  });

  it('từ chối ID sai định dạng', () => {
    expect(orderIndexFromStableKey('')).toBeNull();
    expect(orderIndexFromStableKey('0001')).toBeNull();
    expect(orderIndexFromStableKey('SS001')).toBeNull();
    expect(orderIndexFromStableKey('S0000')).toBeNull();
    expect(orderIndexFromStableKey('S-001')).toBeNull();
  });
});
