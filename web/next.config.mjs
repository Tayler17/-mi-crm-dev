import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check once at config time whether the package is physically installed.
const sentryInstalled = (() => {
  try { _require.resolve('@sentry/nextjs'); return true; }
  catch { return false; }
})();

const sentryStub = path.resolve(__dirname, './src/lib/sentry-stub.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config) => {
    if (!sentryInstalled) {
      // Point every '@sentry/nextjs' import to the no-op stub so the build
      // never fails in environments where Sentry is not installed.
      config.resolve.alias = {
        ...config.resolve.alias,
        '@sentry/nextjs': sentryStub,
      };
    }
    return config;
  },
};

const hasSentry = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
);

let config = nextConfig;

if (hasSentry && sentryInstalled) {
  try {
    const { withSentryConfig } = await import('@sentry/nextjs');
    config = withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
      sourcemaps: { disable: true },
      telemetry: false,
    });
  } catch {
    // Sentry build integration unavailable — continue without it.
  }
}

export default config;
