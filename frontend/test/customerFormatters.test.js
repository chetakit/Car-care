import assert from 'node:assert/strict'
import { test } from 'node:test'
import messages from '../src/i18n/messages.js'
import {
  CUSTOMER_TIME_ZONE,
  formatCustomerBookingPaymentStatus,
  formatCustomerBookingStatus,
  formatCustomerDate,
  formatCustomerMoney,
  formatCustomerPaymentMethod,
  formatCustomerPaymentStatus,
  formatCustomerTime,
  formatCustomerTimestamp,
} from '../src/Customer/customerFormatters.js'

test('translation catalogs contain matching keys and preserve Phase 1 messages', () => {
  assert.deepEqual(Object.keys(messages.TH).sort(), Object.keys(messages.EN).sort())
  const customerKeys = Object.keys(messages.TH).filter((key) => key.startsWith('customer.'))
  assert.ok(customerKeys.length > 0)
  assert.ok(customerKeys.every((key) => Object.hasOwn(messages.EN, key)))
  assert.ok(customerKeys.every((key) => !key.startsWith('common.') && !key.startsWith('language.')))

  const phaseOneMessages = {
    TH: {
      'common.cancel': 'ยกเลิก',
      'common.greeting': 'สวัสดี {name}',
      'common.save': 'บันทึก',
      'language.label': 'ภาษา',
      'language.switchToEnglish': 'Switch language to English',
      'language.switchToThai': 'เปลี่ยนภาษาเป็นไทย',
    },
    EN: {
      'common.cancel': 'Cancel',
      'common.greeting': 'Hello, {name}',
      'common.save': 'Save',
      'language.label': 'Language',
      'language.switchToEnglish': 'Switch language to English',
      'language.switchToThai': 'Switch language to Thai',
    },
  }
  for (const language of ['TH', 'EN']) {
    for (const [key, value] of Object.entries(phaseOneMessages[language])) {
      assert.equal(messages[language][key], value)
    }
  }
})

test('booking and payment labels are localized in Thai and English', () => {
  assert.equal(formatCustomerBookingStatus('PENDING_PAYMENT', 'TH'), 'รอชำระเงิน')
  assert.equal(formatCustomerBookingStatus('PENDING_PAYMENT', 'EN'), 'Awaiting payment')
  assert.equal(formatCustomerPaymentStatus('PAID', 'TH'), 'ชำระแล้ว')
  assert.equal(formatCustomerPaymentStatus('PAID', 'EN'), 'Paid')
  assert.equal(formatCustomerPaymentMethod('WALLET', 'TH'), 'กระเป๋าเงิน Car Care')
  assert.equal(formatCustomerPaymentMethod('WALLET', 'EN'), 'Car Care Wallet')
})

test('booking payment labels distinguish missing, pending, paid and failed payments in both languages', () => {
  const expected = {
    TH: {
      none: 'ยังไม่มีรายการชำระเงิน',
      PENDING: 'รอชำระเงิน',
      PAID: 'ชำระแล้ว',
      FAILED: 'ชำระไม่สำเร็จ',
      simulated: 'จำลอง — ไม่ใช่การชำระเงินจริง',
      unknown: 'ไม่ทราบสถานะการชำระเงิน',
    },
    EN: {
      none: 'No payment record yet',
      PENDING: 'Pending payment',
      PAID: 'Paid',
      FAILED: 'Payment failed',
      simulated: 'simulated — not a real payment',
      unknown: 'Payment status unknown',
    },
  }

  for (const language of ['TH', 'EN']) {
    assert.equal(formatCustomerBookingPaymentStatus(null, language), expected[language].none)
    for (const status of ['PENDING', 'PAID', 'FAILED']) {
      assert.equal(
        formatCustomerBookingPaymentStatus(
          { payment_status: status, payment_method: 'WALLET' },
          language,
        ),
        expected[language][status],
      )
      assert.equal(
        formatCustomerBookingPaymentStatus(
          { payment_status: status, payment_method: 'SIMULATED' },
          language,
        ),
        `${expected[language][status]} (${expected[language].simulated})`,
      )
    }
    assert.equal(
      formatCustomerBookingPaymentStatus({ payment_status: 'UNKNOWN' }, language),
      expected[language].unknown,
    )
  }
})

test('dates, times, timestamps, and THB amounts use the selected locale', () => {
  const date = new Date('2026-11-17T12:00:00+07:00')
  const timestamp = new Date('2026-11-17T09:05:00+07:00')

  for (const [language, locale] of [['TH', 'th-TH'], ['EN', 'en-GB']]) {
    assert.equal(
      formatCustomerDate('2026-11-17', language),
      new Intl.DateTimeFormat(locale, {
        timeZone: CUSTOMER_TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date),
    )
    assert.equal(
      formatCustomerTime('09:05', language),
      new Intl.DateTimeFormat(locale, {
        timeZone: CUSTOMER_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
      }).format(timestamp),
    )
    assert.equal(
      formatCustomerTimestamp('2026-11-17 09:05:00', language),
      new Intl.DateTimeFormat(locale, {
        timeZone: CUSTOMER_TIME_ZONE,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(timestamp),
    )
    // Amount first, baht sign after, the same as the admin pages.
    assert.equal(formatCustomerMoney(1234.5, language), '1,234.50 ฿')
  }

  assert.notEqual(formatCustomerDate('2026-11-17', 'TH'), formatCustomerDate('2026-11-17', 'EN'))
})

test('invalid dates and times use localized fallback labels', () => {
  assert.equal(formatCustomerDate('not-a-date', 'TH'), 'ไม่มีข้อมูลวันที่')
  assert.equal(formatCustomerDate('not-a-date', 'EN'), 'Date unavailable')
  assert.equal(formatCustomerTime('not-a-time', 'TH'), 'ไม่มีข้อมูลเวลา')
  assert.equal(formatCustomerTime('not-a-time', 'EN'), 'Time unavailable')
  assert.equal(formatCustomerTimestamp('not-a-time', 'TH'), 'ไม่มีข้อมูลวันที่')
  assert.equal(formatCustomerTimestamp('not-a-time', 'EN'), 'Date unavailable')
  assert.equal(formatCustomerMoney('invalid', 'TH'), '—')
})

test('omitted languages preserve existing formatter defaults and invalid languages are rejected', () => {
  assert.equal(formatCustomerBookingPaymentStatus(null), 'ยังไม่มีรายการชำระเงิน')
  assert.equal(formatCustomerBookingStatus('CONFIRMED'), 'Confirmed')
  assert.equal(formatCustomerPaymentStatus('FAILED'), 'Payment failed')
  assert.equal(formatCustomerPaymentMethod('SIMULATED'), 'Simulated demo payment')
  assert.throws(() => formatCustomerBookingStatus('CONFIRMED', 'FR'), TypeError)
  assert.throws(() => formatCustomerDate('2026-11-17', 'FR'), TypeError)
  assert.throws(() => formatCustomerMoney(10, 'FR'), TypeError)
})
