import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoMarkIQ',
  description: 'Plataforma todo-en-uno para comunicación, automatización y ventas.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AutoMarkIQ',
  },
  icons: {
    apple: '/icons/icon-192.png',
    icon: '/icons/icon-512.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Umami web analytics — only on production, identified by the prod API URL
  // (NEXT_PUBLIC_API_URL is a build arg, so this is baked into the static HTML at
  // build time). Staging/dev use a non-automarkiq API URL → no tracking there.
  const trackAnalytics = process.env.NEXT_PUBLIC_API_URL?.includes('api.automarkiq.com');
  return (
    <html lang="es">
      <body>
        {children}
        {trackAnalytics && (
          <script defer src="https://analytics.automarkiq.com/script.js" data-website-id="a87bfb2a-1f3f-49e3-9c84-a9887808e52f"></script>
        )}
      </body>
    </html>
  );
}
