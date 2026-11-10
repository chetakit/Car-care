export default function formatMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'THB' }).format(amount)
    : '—'
}
