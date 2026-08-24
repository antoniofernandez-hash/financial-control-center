import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Financial Control Center',
    short_name: 'Financial Center',
    description: 'Gestión patrimonial, inversiones, liquidez, financiación y riesgo',
    start_url: '/',
    display: 'standalone',
    background_color: '#061525',
    theme_color: '#061525',
    orientation: 'portrait-primary',
    icons: [
      { src: '/pwa-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
