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
  // Umami web analytics — inert unless both env vars are set on the web server
  // (runtime, server-side → no rebuild needed to enable/disable). See deploy/umami.
  const umamiSrc = process.env.UMAMI_SRC;
  const umamiId = process.env.UMAMI_WEBSITE_ID;
  return (
    <html lang="es">
      <body>
        {children}
        {umamiSrc && umamiId && (
          <script defer src={umamiSrc} data-website-id={umamiId}></script>
        )}
      </body>
    </html>
  );
}
