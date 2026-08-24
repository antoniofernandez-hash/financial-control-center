export const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

export const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

export function pct(value: number | null | undefined) {
  if (value == null) return '—'
  return `${(Number(value) * 100).toFixed(1)}%`
}
