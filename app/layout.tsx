import type { Metadata } from 'next'
import './globals.css'
import './error-fix.css'
import './mobile-fix.css'
import ValuationStatus from './valuation-status'

export const metadata: Metadata = {
  title: 'Financial Control Center',
  description: 'Control de cartera, riesgo y financiación Lombard',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><ValuationStatus />{children}</body></html>
}
