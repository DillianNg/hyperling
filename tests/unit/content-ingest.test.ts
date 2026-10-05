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

describe('parseGlossary', () => {
  it('tách đúng định dạng "từ = nghĩa; từ = nghĩa" của file gốc', () => {
    const { entries, malformed } = parseGlossary('der Morgen = buổi sáng; gut = tốt');
    expect(malformed).toEqual([]);
    expect(entries).toEqual([
      { term: 'der Morgen', meaning: 'buổi sáng', partOfSpeech: 'noun', fields: { gender: 'der' } },
      { term: 'gut', meaning: 'tốt', partOfSpeech: 'other', fields: {} },
    ]);
  });

  it('suy ra giống danh từ từ mạo từ der/die/das', () => {
    const { entries } = parseGlossary('die Karte = tấm thẻ; das Geschenk = món quà; der Tag = ngày');
    expect(entries.map((e) => e.fields.gender)).toEqual(['die', 'das', 'der']);
    expect(entries.every((e) => e.partOfSpeech === 'noun')).toBe(true);
  });

  it('báo lại mục thiếu dấu "=" thay vì đoán', () => {
    const { entries, malformed } = parseGlossary('gut = tốt; thiếu dấu bằng; schön = đẹp');
    expect(entries).toHaveLength(2);
    expect(malformed).toEqual(['thiếu dấu bằng']);
  });

  it('báo lại mục chỉ có một nửa', () => {
    const { entries, malformed } = parseGlossary('= chỉ có nghĩa; từ không nghĩa =');
    expect(entries).toEqual([]);
    expect(malformed).toEqual(['= chỉ có nghĩa', 'từ không nghĩa =']);
  });

  it('bỏ qua dấu ; thừa và chuỗi rỗng', () => {
    expect(parseGlossary('').entries).toEqual([]);
    expect(parseGlossary(';;;').entries).toEqual([]);
    expect(parseGlossary('gut = tốt;').entries).toHaveLength(1);
  });

  it('giữ nguyên dấu "=" nằm trong phần nghĩa', () => {
    const { entries } = parseGlossary('gleich = bằng = ngang nhau');
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
