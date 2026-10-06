import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { THEME_INIT_SCRIPT } from '@/lib/theme-store';
import { ServiceWorkerRegistrar } from '@/components/service-worker';
import { getUserLocale } from '@/lib/i18n/locale';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import './globals.css';

/**
 * One family for everything.
 *
 * Inter is a variable font covering Vietnamese and Latin Extended, so
 * "Nghĩa tiếng Việt" and "Grüße" render in the same face with no fallback.
 * A second display family cost nine extra font files and pushed Largest
 * Contentful Paint out by seconds, for a difference headings do not need:
 * weight and tracking carry the hierarchy instead.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
  adjustFontFallback: true,
  preload: true,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: `${t('name')} — ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    formatDetection: { telephone: false },
    // Declared explicitly rather than by file convention, because the same icon
    // files are also referenced by the web app manifest.
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/icon-192.png', sizes: '192x192' }],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available: capping it would fail WCAG 1.4.4.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfbf7' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1917' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getUserLocale();
  const messages = await getMessages();
  const { fontScale, reducedMotion } = await getAppearance();

  return (
    <html
      lang={locale}
      className={inter.variable}
      style={{ '--font-scale': fontScale } as React.CSSProperties}
      data-reduced-motion={reducedMotion ? 'true' : undefined}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint; see THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <ServiceWorkerRegistrar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * Accessibility preferences from the learner's profile, applied on the server so
 * they are correct on first paint rather than snapping into place after hydration.
 * A signed-out visitor, or an unconfigured project, gets the defaults.
 */
async function getAppearance(): Promise<{ fontScale: number; reducedMotion: boolean }> {
  const fallback = { fontScale: 1, reducedMotion: false };
  if (!isSupabaseConfigured()) return fallback;

  const user = await getCurrentUser();
  if (!user) return fallback;

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('font_scale, reduced_motion')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { font_scale?: string | number; reduced_motion?: boolean } | null;
  const parsed = Number(profile?.font_scale ?? 1);

  return {
    fontScale: Number.isFinite(parsed) && parsed >= 0.8 && parsed <= 1.6 ? parsed : 1,
    reducedMotion: profile?.reduced_motion === true,
  };
}
