import type { NextConfig } from 'next';

/**
 * next-intl is wired up by hand rather than through `next-intl/plugin`, because
 * that plugin pulls in @swc/core, whose prebuilt native binary does not load on
 * every macOS version. The plugin's essential job is this single alias; its other
 * feature (build-time message extraction) is an optimisation we do not need.
 * See docs/DECISIONS.md.
 */
const I18N_REQUEST_CONFIG = './src/lib/i18n/request.ts';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  turbopack: {
    resolveAlias: {
      'next-intl/config': I18N_REQUEST_CONFIG,
    },
  },
  webpack(config: { resolve: { alias: Record<string, string> } }) {
    config.resolve.alias['next-intl/config'] = new URL(I18N_REQUEST_CONFIG, import.meta.url).pathname;
    return config;
  },
};

export default nextConfig;
