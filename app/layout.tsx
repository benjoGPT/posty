import type { Metadata, Viewport } from 'next';
import { preload } from 'react-dom';
import '@fontsource-variable/inter';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { APP_CONFIG } from '@/config/app';

const description = 'Explore UK postcode areas, districts, sectors and individual postcodes on an interactive map. Search any postcode, see where it is and how postal geography fits together.';

// Absolute base for share images: set NEXT_PUBLIC_SITE_URL, or Vercel provides its production URL.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Postcode Explorer — interactive UK postcode map',
  description,
  applicationName: 'Postcode Explorer',
  appleWebApp: { capable: true, title: 'Postcodes', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: { title: 'Postcode Explorer', description, type: 'website', locale: 'en_GB', siteName: 'Postcode Explorer' },
  twitter: { card: 'summary_large_image', title: 'Postcode Explorer', description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#141b29' },
  ],
};

// Applies the saved theme before first paint to avoid a light flash.
const themeScript = `try{if(localStorage.getItem('pc-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Start fetching the startup data alongside the JavaScript.
  for (const f of ['manifest.json', 'index.json', 'areas.geojson']) preload(`${APP_CONFIG.dataBaseUrl}/${f}`, { as: 'fetch', crossOrigin: 'anonymous' });
  return (
    <html lang="en-GB" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
