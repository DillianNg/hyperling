import type { Metadata, Viewport } from 'next';
import { Inter, Be_Vietnam_Pro } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { THEME_INIT_SCRIPT } from '@/lib/theme-store';
import { getUserLocale } from '@/lib/i18n/locale';
import './globals.css';

/**
 * Both faces are loaded with the Vietnamese subset alongside latin-ext, so
 * "Nghĩa tiếng Việt" and "Grüße" render in the same family without fallback.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

const display = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: `${t('name')} — ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfbf7' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1917' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getUserLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint; see THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
