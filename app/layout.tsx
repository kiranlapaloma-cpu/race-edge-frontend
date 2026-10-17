import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Race Edge | Race Control', description: 'Private horse racing performance intelligence', appleWebApp: { capable: true, title: 'Race Edge', statusBarStyle: 'black-translucent' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1018' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
