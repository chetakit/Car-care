// Labels that read better than the raw enum value.
const LABELS = {
  PENDING_PAYMENT: 'Awaiting payment',
  NO_SHOW: 'No-show',
  REFUND_PENDING: 'Refund pending',
  REFUND_FAILED: 'Refund failed',
}

export default function formatStatusLabel(value) {
  if (!value) return '—'
  return LABELS[value] ??
    String(value).toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
