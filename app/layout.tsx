import type { Metadata } from 'next'
import './globals.css'
import './error-fix.css'
import './mobile-fix.css'
import './valuation-status.css'
import './wealth-management.css'
import ValuationStatus from './valuation-status'
import DocumentImport from './document-import'

export const metadata: Metadata = {
  title: 'Financial Control Center',
  description: 'Gestión patrimonial, inversiones, liquidez, financiación y riesgo',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><ValuationStatus />{children}<DocumentImport /></body></html>
}
