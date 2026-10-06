import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../../src/config/app.config.js';

/**
 * The two message files must stay in step.
 *
 * next-intl throws on a missing key rather than falling back, so a key added to
 * vi.json alone is a crash for every English reader — on a page nobody on this
 * project opens by default. That makes it exactly the kind of mistake a test
 * should catch instead of a user.
 */

const MESSAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'messages');

type Messages = { [key: string]: string | Messages };

function load(locale: string): Messages {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8')) as Messages;
}

function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [nested, text] of flatten(value, path)) out.set(nested, text);
  }
  return out;
}

/** ICU placeholders such as {count}, ignoring plural/select bodies. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]!).sort();
}

const BASE = 'vi';
const base = flatten(load(BASE));

describe('tệp ngôn ngữ', () => {
  for (const locale of LOCALES.filter((code) => code !== BASE)) {
    const other = flatten(load(locale));

    it(`${locale}.json có đúng bộ khoá như ${BASE}.json`, () => {
      const missing = [...base.keys()].filter((key) => !other.has(key));
      const extra = [...other.keys()].filter((key) => !base.has(key));

      expect(missing, `${locale}.json thiếu khoá`).toEqual([]);
      expect(extra, `${locale}.json thừa khoá`).toEqual([]);
    });

    it(`${locale}.json dùng đúng các biến nội suy như ${BASE}.json`, () => {
      // A translation that drops {count} renders a sentence missing its number.
      const mismatched = [...base.entries()]
        .filter(([key, text]) => {
          const translated = other.get(key);
          return translated !== undefined && placeholders(text).join() !== placeholders(translated).join();
        })
        .map(([key]) => key);

      expect(mismatched).toEqual([]);
    });

    it(`${locale}.json không có chuỗi rỗng`, () => {
      const blank = [...other.entries()].filter(([, text]) => text.trim() === '').map(([key]) => key);
      expect(blank).toEqual([]);
    });
  }
});
