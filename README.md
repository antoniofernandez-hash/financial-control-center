# Financial Control Center

Frontend reconstruido para el proyecto existente de Supabase `Financial Control Center`.

## Stack
- Next.js 16.3 App Router
- React 19
- Supabase JS 2.112.4
- Supabase existente: `xscpqzngiiwbbqnkgzdd` (Frankfurt)

## Configuración
1. Copiar `.env.example` a `.env.local`.
2. Añadir la publishable key del proyecto Supabase.
3. Ejecutar `npm install` y `npm run dev`.

## Modelo usado
`portfolios`, `accounts`, `assets`, `positions`, `lombard_facilities`, `portfolio_snapshots`.
Las lecturas están protegidas por las políticas RLS existentes y requieren usuario autenticado.

## Seguridad
- No usar nunca `service_role` en el frontend.
- No se ha modificado la base de datos durante esta reconstrucción.
- El dashboard toma la fecha más reciente de posiciones y la fecha más reciente de Lombard por cartera.
