import type { Metadata, Viewport } from 'next'
import './globals.css'
import './error-fix.css'
import './mobile-fix.css'
import './valuation-status.css'
import './wealth-management.css'
import ValuationStatus from './valuation-status'

export const metadata: Metadata = {
  title: 'Financial Control Center',
  description: 'Gestión patrimonial, inversiones, liquidez, financiación y riesgo',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Financial Center',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/pwa-icon?size=192',
    apple: '/pwa-icon?size=180',
  },
}

export const viewport: Viewport = {
  themeColor: '#061525',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><ValuationStatus />{children}</body></html>
}
