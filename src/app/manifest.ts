import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/config/app.config';

/**
 * PWA manifest. Generated from the same config as the rest of the app, so the
 * product name lives in exactly one place.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Học ngôn ngữ bằng cả câu`,
    short_name: APP_NAME,
    description:
      'Học ngôn ngữ bằng cả câu, theo đúng tốc độ của bạn. Lặp lại ngắt quãng, kế hoạch tự tính.',
    start_url: '/bang-dieu-khien',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fdfbf7',
    theme_color: '#fdfbf7',
    lang: 'vi',
    categories: ['education'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
