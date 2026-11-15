import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCustomerBookingPaymentStatus } from '../src/Customer/customerFormatters.js'

test('booking payment labels distinguish missing, pending, paid and failed payments', () => {
  assert.equal(formatCustomerBookingPaymentStatus(null), 'ยังไม่มีรายการชำระเงิน')
  for (const [status, label] of [
    ['PENDING', 'รอชำระเงิน'],
    ['PAID', 'ชำระแล้ว'],
    ['FAILED', 'ชำระไม่สำเร็จ'],
  ]) {
    assert.equal(formatCustomerBookingPaymentStatus({ payment_status: status, payment_method: 'WALLET' }), label)
    assert.equal(
      formatCustomerBookingPaymentStatus({ payment_status: status, payment_method: 'SIMULATED' }),
      `${label} (จำลอง — ไม่ใช่การชำระเงินจริง)`,
    )
  }
})

test('an unknown payment status is not reported as paid or as a missing record', () => {
  assert.equal(formatCustomerBookingPaymentStatus({ payment_status: 'UNKNOWN' }), 'ไม่ทราบสถานะการชำระเงิน')
})
