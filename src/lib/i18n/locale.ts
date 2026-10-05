'use server';

import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/config/app.config';

const COOKIE_NAME = 'hyperling-locale';
const ONE_YEAR = 60 * 60 * 24 * 365;

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/**
 * Locale resolution. A cookie rather than a URL prefix, because Vietnamese is
 * the default and English is an opt-in — URLs stay clean and no route changes
 * are needed when a locale is added.
 */
export async function getUserLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function setUserLocale(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, locale, { maxAge: ONE_YEAR, sameSite: 'lax', path: '/' });
}
