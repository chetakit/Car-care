import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import formatMoney from '../Admin/utils/formatMoney.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'
import './booking.css'

const BOOKING_WINDOW_DAYS = 14
const STEPS = [
  ['customer.booking.step.vehicle', 'customer.booking.step.chooseVehicle'],
  ['customer.booking.step.services', 'customer.booking.step.chooseServices'],
  ['customer.booking.step.dateTime', 'customer.booking.step.chooseSlot'],
  ['customer.booking.step.summary', 'customer.booking.step.reviewConfirm'],
]

function localDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(dateValue, days) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

function normalizeScheduleDate(value) {
  const date = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function formatDate(value, language, t, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return t('customer.formatter.dateUnavailable')
  return new Intl.DateTimeFormat(language === 'TH' ? 'th-TH' : 'en-GB', options).format(
    new Date(year, month - 1, day),
  )
}

function formatTime(value, t) {
  const time = String(value ?? '').slice(0, 5)
  return time || t('customer.formatter.timeUnavailable')
}

function priceToCents(value) {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) return null
  const [, whole, fraction = ''] = match
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

function formatCents(cents) {
  return formatMoney(Number(cents) / 100)
}

function formatDuration(minutes, t) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return t('customer.booking.durationMinutes', { minutes: rest })
  if (!rest) return t('customer.booking.durationHours', { hours })
  return t('customer.booking.durationHoursMinutes', { hours, minutes: rest })
}

function centsToAmount(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

function amountToCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''))
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}

function couponDiscountLabel(coupon) {
  return coupon.discount_type === 'PERCENT'
    ? `${Number(coupon.discount_value)}%`
    : formatCents(amountToCents(coupon.discount_value) ?? 0n)
}

// Turns the server's coupon rule message into a reason the customer can read.
function couponReasonText(error, t) {
  const message = error instanceof ApiError ? String(error.message) : ''
  const minimum = /minimum order of THB (\d+(?:\.\d{1,2})?)/i.exec(message)
  if (minimum) {
    return t('customer.booking.couponReason.minimum', {
      amount: formatCents(amountToCents(minimum[1]) ?? 0n),
    })
  }
  if (/not active yet/i.test(message)) return t('customer.booking.couponReason.notStarted')
  if (/expired/i.test(message)) return t('customer.booking.couponReason.expired')
  if (/usage limit/i.test(message)) return t('customer.booking.couponReason.limit')
  if (/not valid/i.test(message)) return t('customer.booking.couponReason.invalid')
  return t('customer.booking.couponCheckError')
}

function vehicleLabel(vehicle, t) {
  return [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' ') ||
    t('customer.booking.vehicle')
}

function scheduleIsSelectable(schedule) {
  const status = String(schedule.status ?? 'AVAILABLE').toUpperCase()
  return status === 'AVAILABLE' && Number(schedule.remaining_capacity) > 0
}

function getBookingErrorMessage(error, t) {
  const message = error.message || ''
  if (!(error instanceof ApiError)) return t('customer.booking.createError')

  if (error.status === 409 && /schedule|capacity/i.test(message)) {
    return t('customer.booking.scheduleUnavailable')
  }
  if (error.status === 409 && /vehicle|model|type/i.test(message)) {
    return t('customer.booking.vehicleNoLongerAvailable')
  }
  if (error.status === 409 && /price/i.test(message)) {
    return t('customer.booking.priceNoLongerAvailable')
  }
  if (error.status === 400 && /schedule duration/i.test(message)) {
    return t('customer.booking.scheduleTooShort')
  }
  if (error.status === 400 && /final_amount|greater than zero/i.test(message)) {
    return t('customer.booking.priceMustBePositive')
  }
  return t('customer.booking.createError')
}

function PageState({ children, error = false, onRetry, retryLabel }) {
  return (
    <div className={`booking-state${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
      {children}
      {onRetry && (
        <button className="booking-text-button" onClick={onRetry} type="button">
          {retryLabel}
        </button>
      )}
    </div>
  )
}

function VehicleIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
      <path d="M7 29.5h3l3.2-10.2a4 4 0 0 1 3.8-2.8h14a4 4 0 0 1 3.8 2.8L38 29.5h3v7h-3.5v3h-5v-3h-17v3h-5v-3H7v-7Z" />
      <path d="M13.5 28h21l-2.7-8H16.2l-2.7 8Z" />
    </svg>
  )
}

function CustomerBookingPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const { language, t } = useLanguage()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [step, setStep] = useState(1)
  const [vehicles, setVehicles] = useState([])
  const [vehicleModels, setVehicleModels] = useState([])
  const [vehicleState, setVehicleState] = useState('loading')
  const [vehicleReload, setVehicleReload] = useState(0)
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [services, setServices] = useState([])
  const [serviceState, setServiceState] = useState('loading')
  const [serviceReload, setServiceReload] = useState(0)
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [priceResult, setPriceResult] = useState({
    key: null,
    status: 'idle',
    prices: {},
  })
  const [priceReload, setPriceReload] = useState(0)
  // A day picked in the availability calendar on /services (?date=YYYY-MM-DD).
  const [preferredDate] = useState(() => {
    const date = new URLSearchParams(window.location.search).get('date') || ''
    return /^d{4}-d{2}-d{2}$/.test(date) && date >= localDateString(new Date()) ? date : ''
  })
  const [scheduleRangeStart, setScheduleRangeStart] = useState(() => {
    const todayValue = localDateString(new Date())
    // Open the week of the picked day when it is beyond the first two weeks.
    return preferredDate && preferredDate > shiftDate(todayValue, BOOKING_WINDOW_DAYS - 1)
      ? preferredDate
      : todayValue
  })
  const [schedules, setSchedules] = useState([])
  const [scheduleState, setScheduleState] = useState('idle')
  const [scheduleReload, setScheduleReload] = useState(0)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponError, setCouponError] = useState('')
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [couponsState, setCouponsState] = useState('idle')
  const [couponReload, setCouponReload] = useState(0)
  const [selectedCouponCode, setSelectedCouponCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [bookingResult, setBookingResult] = useState(null)
  const submissionInProgress = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      api('/api/customer/vehicles', { signal: controller.signal }),
      api('/api/customer/catalog/vehicle-models', { signal: controller.signal }),
    ])
      .then(([vehicleResponse, modelResponse]) => {
        const vehicleItems = vehicleResponse.data?.items
        const modelItems = modelResponse.data?.items
        if (!Array.isArray(vehicleItems) || !Array.isArray(modelItems)) {
          throw new Error('The vehicle response is incomplete.')
        }
        setVehicles(vehicleItems)
        setVehicleModels(modelItems)
        setVehicleState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setVehicleState('error')
      })

    return () => controller.abort()
  }, [api, vehicleReload])

  useEffect(() => {
    const controller = new AbortController()

    api('/api/customer/catalog/services', { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The service catalog returned an invalid response.')
        }
        setServices(items.filter((service) => service.status === 'ACTIVE'))
        setServiceState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setServiceState('error')
      })

    return () => controller.abort()
  }, [api, serviceReload])

  const selectedVehicle = vehicles.find(
    (vehicle) => String(vehicle.vehicle_id) === selectedVehicleId,
  )
  const selectedModel = selectedVehicle && vehicleModels.find(
    (model) => String(model.model_id) === String(selectedVehicle.model_id),
  )
  const vehicleTypeId = selectedModel?.vehicle_type_id
  const rangeEnd = shiftDate(scheduleRangeStart, BOOKING_WINDOW_DAYS - 1)
  const today = localDateString(new Date())
  const priceRequestKey =
    vehicleTypeId && serviceState === 'ready' && services.length > 0
      ? `${vehicleTypeId}:${services.map((service) => service.service_id).join(',')}:${serviceReload}:${priceReload}`
      : null

  useEffect(() => {
    if (!priceRequestKey) return undefined

    const controller = new AbortController()

    Promise.all(
      services.map(async (service) => {
        const serviceId = String(service.service_id)
        const response = await api(
          `/api/customer/catalog/services/${encodeURIComponent(serviceId)}/prices?vehicle_type_id=${encodeURIComponent(String(vehicleTypeId))}`,
          { signal: controller.signal },
        )
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The service price response is incomplete.')
        }

        const price = items.find(
          (item) => String(item.vehicle_type_id) === String(vehicleTypeId),
        )
        if (!price) return [serviceId, null]

        const cents = priceToCents(price.price)
        if (cents === null) {
          throw new Error('A service returned an invalid price.')
        }
        return [serviceId, cents]
      }),
    )
      .then((entries) => {
        const prices = Object.fromEntries(entries)
        setPriceResult({
          key: priceRequestKey,
          status: 'ready',
          prices,
        })
        setSelectedServiceIds((current) =>
          current.filter((serviceId) => typeof prices[serviceId] === 'bigint'),
        )
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setPriceResult({
            key: priceRequestKey,
            status: 'error',
            prices: {},
          })
        }
      })

    return () => controller.abort()
  }, [api, priceRequestKey, services, vehicleTypeId])

  const priceState = !priceRequestKey
    ? 'idle'
    : priceResult.key === priceRequestKey
      ? priceResult.status
      : 'loading'
  const servicePrices =
    priceResult.key === priceRequestKey ? priceResult.prices : {}
  // Total time of the chosen services; long visits continue into the next slots.
  const totalDurationMinutes = services
    .filter((service) => selectedServiceIds.includes(String(service.service_id)))
    .reduce((total, service) => total + (Number(service.duration_minutes) || 0), 0)

  useEffect(() => {
    if (step !== 3 || scheduleState === 'ready' || scheduleState === 'error') {
      return undefined
    }

    const controller = new AbortController()
    const query = new URLSearchParams({
      from: scheduleRangeStart,
      to: rangeEnd,
    })
    // Only offer start times with enough back-to-back slots for all services.
    if (totalDurationMinutes > 0) query.set('duration_minutes', String(totalDurationMinutes))

    api(`/api/customer/schedules/availability?${query.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The schedule response is incomplete.')
        }
        const normalizedItems = items.map((schedule) => {
          const date = normalizeScheduleDate(schedule.schedule_date)
          if (
            !date ||
            schedule.schedule_id === null ||
            schedule.schedule_id === undefined ||
            schedule.capacity === null ||
            schedule.capacity === undefined ||
            !Number.isInteger(Number(schedule.capacity)) ||
            Number(schedule.capacity) < 0 ||
            schedule.booked_count === null ||
            schedule.booked_count === undefined ||
            !Number.isInteger(Number(schedule.booked_count)) ||
            Number(schedule.booked_count) < 0 ||
            schedule.remaining_capacity === null ||
            schedule.remaining_capacity === undefined ||
            !Number.isInteger(Number(schedule.remaining_capacity)) ||
            Number(schedule.remaining_capacity) < 0
          ) {
            throw new Error('A schedule returned incomplete details.')
          }
          return { ...schedule, schedule_date: date }
        })
        setSchedules(normalizedItems)
        setSelectedDate(
          normalizedItems.find(
            (schedule) => schedule.schedule_date === preferredDate && scheduleIsSelectable(schedule),
          )?.schedule_date ||
            normalizedItems.find(scheduleIsSelectable)?.schedule_date ||
            normalizedItems[0]?.schedule_date ||
            '',
        )
        setScheduleState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setScheduleState('error')
      })

    return () => controller.abort()
  }, [api, preferredDate, rangeEnd, scheduleRangeStart, scheduleReload, scheduleState, step, totalDurationMinutes])

  useEffect(() => {
    if (step !== 4 || couponsState === 'ready' || couponsState === 'error') {
      return undefined
    }

    const controller = new AbortController()
    api('/api/customer/coupons/available', { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The available coupons response is incomplete.')
        }
        setAvailableCoupons(items)
        setCouponsState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setCouponsState('error')
      })

    return () => controller.abort()
  }, [api, couponReload, couponsState, step])

  const availableVehicles = vehicles.map((vehicle) => {
    const model = vehicleModels.find(
      (item) => String(item.model_id) === String(vehicle.model_id),
    )
    return {
      ...vehicle,
      activeModel: model,
      selectable: vehicle.status === 'ACTIVE' && Boolean(model?.vehicle_type_id),
    }
  })
  const availableDates = [...new Set(schedules.map((schedule) => schedule.schedule_date))]
  const dateSchedules = schedules.filter(
    (schedule) => schedule.schedule_date === selectedDate,
  )
  const selectedSchedule = schedules.find(
    (schedule) => String(schedule.schedule_id) === selectedScheduleId,
  )
  const selectedServices = services.filter((service) =>
    selectedServiceIds.includes(String(service.service_id)),
  )
  const totalCents = selectedServices.reduce(
    (total, service) => total + (servicePrices[String(service.service_id)] ?? 0n),
    0n,
  )
  // A coupon preview only counts while the subtotal it was checked against is unchanged.
  const activeCoupon =
    appliedCoupon && appliedCoupon.subtotalCents === totalCents ? appliedCoupon : null
  const payableCents = activeCoupon ? activeCoupon.finalCents : totalCents

  async function applyCoupon(code) {
    if (!code || couponChecking || totalCents <= 0n) return
    setCouponChecking(true)
    setCouponError('')
    try {
      const query = new URLSearchParams({ code, subtotal: centsToAmount(totalCents) })
      const response = await api(`/api/customer/coupons/preview?${query}`)
      const discountCents = amountToCents(response.data?.discount_amount)
      const finalCents = amountToCents(response.data?.final_amount)
      if (discountCents === null || finalCents === null) {
        throw new Error('The coupon response was incomplete.')
      }
      setAppliedCoupon({
        code: response.data.coupon_code,
        description: response.data.description,
        subtotalCents: totalCents,
        discountCents,
        finalCents,
      })
    } catch (error) {
      setAppliedCoupon(null)
      setCouponError(couponReasonText(error, t))
    } finally {
      setCouponChecking(false)
    }
  }

  function retryCoupons() {
    setCouponsState('idle')
    setCouponReload((current) => current + 1)
  }

  function removeCoupon() {
    setAppliedCoupon(null)
    setCouponError('')
  }

  const canContinue =
    (step === 1 && Boolean(selectedVehicle && vehicleTypeId)) ||
    (step === 2 &&
      selectedServiceIds.length > 0 &&
      totalCents > 0n &&
      priceState === 'ready') ||
    (step === 3 && Boolean(selectedSchedule && scheduleIsSelectable(selectedSchedule)))

  function chooseVehicle(vehicle) {
    setSelectedVehicleId(String(vehicle.vehicle_id))
    setSelectedServiceIds([])
    setSelectedScheduleId('')
    setSelectedDate('')
    setSubmitError('')
  }

  function toggleService(serviceId) {
    const id = String(serviceId)
    setSelectedServiceIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    )
    setSubmitError('')
  }

  function chooseSchedule(schedule) {
    if (!scheduleIsSelectable(schedule)) return
    setSelectedDate(schedule.schedule_date)
    setSelectedScheduleId(String(schedule.schedule_id))
    setSubmitError('')
  }

  function goToStep(nextStep) {
    if (nextStep > step) return
    setSubmitError('')
    setStep(nextStep)
  }

  function moveToStep(nextStep) {
    setSubmitError('')
    if (nextStep === 3) {
      setScheduleState('loading')
      setSchedules([])
      setSelectedDate('')
      setSelectedScheduleId('')
    }
    setStep(nextStep)
  }

  function changeScheduleRange(direction) {
    setScheduleRangeStart((current) => {
      const next = shiftDate(
        current,
        direction * BOOKING_WINDOW_DAYS,
      )
      return direction < 0 && next < today ? today : next
    })
    setScheduleState('loading')
    setSchedules([])
    setSelectedDate('')
    setSelectedScheduleId('')
    setSubmitError('')
  }

  function showToday() {
    if (scheduleRangeStart === today) return
    setScheduleRangeStart(today)
    setScheduleState('loading')
    setSchedules([])
    setSelectedDate('')
    setSelectedScheduleId('')
    setSubmitError('')
  }

  function retryVehicles() {
    setSelectedVehicleId('')
    setVehicleState('loading')
    setVehicleReload((current) => current + 1)
  }

  function retryServices() {
    setServiceState('loading')
    setServiceReload((current) => current + 1)
  }

  function retryPrices() {
    setPriceReload((current) => current + 1)
  }

  function retrySchedules() {
    setScheduleState('loading')
    setScheduleReload((current) => current + 1)
  }

  async function confirmBooking() {
    if (
      submissionInProgress.current ||
      !selectedVehicle ||
      !selectedSchedule ||
      !scheduleIsSelectable(selectedSchedule) ||
      selectedServiceIds.length === 0 ||
      totalCents <= 0n ||
      priceState !== 'ready'
    ) {
      return
    }

    submissionInProgress.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await api('/api/customer/bookings', {
        method: 'POST',
        body: {
          vehicle_id: Number(selectedVehicle.vehicle_id),
          schedule_id: Number(selectedSchedule.schedule_id),
          service_ids: selectedServiceIds.map(Number),
          ...(activeCoupon ? { coupon_code: activeCoupon.code } : {}),
        },
      })
      if (response.status !== 'success' || response.data?.booking_id == null) {
        throw new Error('The booking response was incomplete.')
      }

      setBookingResult({ bookingId: response.data.booking_id })
    } catch (error) {
      setSubmitError(getBookingErrorMessage(error, t))
      if (error instanceof ApiError && /coupon/i.test(error.message)) {
        setAppliedCoupon(null)
        setCouponError(t('customer.booking.couponCheckError'))
      }
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        /schedule|capacity/i.test(error.message)
      ) {
        setScheduleReload((current) => current + 1)
        setScheduleState('loading')
        setSchedules([])
        setSelectedDate('')
        setSelectedScheduleId('')
        setStep(3)
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        /vehicle|model|type/i.test(error.message)
      ) {
        setSelectedVehicleId('')
        setSelectedServiceIds([])
        setSelectedScheduleId('')
        setVehicleState('loading')
        setVehicleReload((current) => current + 1)
        setStep(1)
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        /price/i.test(error.message)
      ) {
        setPriceReload((current) => current + 1)
        setStep(2)
      }
    } finally {
      submissionInProgress.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="customer-home customer-booking-page">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="booking-main">
        <div className="customer-container">
          <nav
            aria-label={t('customer.profile.breadcrumbLabel')}
            className="booking-breadcrumb"
          >
            <a href="/customer">{t('customer.common.home')}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t('customer.booking.title')}</span>
          </nav>

          <header className="booking-heading">
            {bookingResult ? (
              <div>
                <span className="customer-eyebrow">{t('customer.booking.createdEyebrow')}</span>
                <h1>{t('customer.booking.createdTitle')}</h1>
                <p>{t('customer.booking.referenceDue', { bookingId: bookingResult.bookingId })}</p>
              </div>
            ) : (
              <>
                <div>
                  <span className="customer-eyebrow">{t('customer.booking.eyebrow')}</span>
                  <h1>{t('customer.booking.title')}</h1>
                  <p>{t('customer.booking.description')}</p>
                </div>
                <span className="booking-heading-mark"><BrandMark /></span>
              </>
            )}
          </header>

          {bookingResult ? (
            <section
              aria-labelledby="booking-success-title"
              aria-live="polite"
              className="booking-success"
              role="status"
            >
              <span aria-hidden="true" className="booking-success-mark">✓</span>
              <div>
                <h2 id="booking-success-title">{t('customer.booking.heldTitle')}</h2>
                <p>
                  {t('customer.booking.paymentRequired')}
                </p>
                <div className="booking-success-actions">
                  <a
                    className="customer-button customer-button-primary"
                    href={`/customer/payment/${encodeURIComponent(bookingResult.bookingId)}`}
                  >
                    {t('customer.booking.payNow')}
                    <span aria-hidden="true">→</span>
                  </a>
                  <a className="booking-secondary-link" href="/customer/bookings">
                    {t('customer.booking.viewBookings')}
                  </a>
                </div>
              </div>
            </section>
          ) : (
            <>
          <nav
            aria-label={t('customer.booking.stepsNavigationLabel')}
            className="booking-steps"
          >
            {STEPS.map(([titleKey, descriptionKey], index) => {
              const title = t(titleKey)
              const description = t(descriptionKey)
              const stepNumber = index + 1
              const complete = stepNumber < step
              return (
                <button
                  aria-label={t('customer.booking.stepLabel', {
                    step: stepNumber,
                    total: STEPS.length,
                    title,
                    description,
                    completed: complete ? t('customer.booking.completed') : '',
                  })}
                  aria-current={stepNumber === step ? 'step' : undefined}
                  className={`booking-step${stepNumber === step ? ' is-current' : ''}${complete ? ' is-complete' : ''}`}
                  disabled={stepNumber >= step}
                  key={titleKey}
                  onClick={() => goToStep(stepNumber)}
                  type="button"
                >
                  <span className="booking-step-number">
                    {complete ? '✓' : `0${stepNumber}`}
                  </span>
                  <span className="booking-step-copy">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              )
            })}
          </nav>

          {submitError && (
            <div className="booking-alert" role="alert">
              <span aria-hidden="true">!</span>
              <p>{submitError}</p>
            </div>
          )}

          <section
            aria-busy={submitting}
            aria-labelledby="booking-panel-title"
            className="booking-panel"
          >
            <div className="booking-panel-heading">
              <div>
                <span className="booking-panel-kicker">
                  {t('customer.booking.panelStep', { step: String(step).padStart(2, '0') })}
                </span>
                <h2 id="booking-panel-title">{t(STEPS[step - 1][1])}</h2>
              </div>
              <span className="booking-panel-note">
                {t('customer.booking.paymentConfirmationNote')}
              </span>
            </div>

            {step === 1 && (
              <div className="booking-step-content">
                {vehicleState === 'loading' && (
                  <PageState>
                    <span className="customer-loader" />
                    {t('customer.booking.loadingVehicles')}
                  </PageState>
                )}
                {vehicleState === 'error' && (
                  <PageState
                    error
                    onRetry={retryVehicles}
                    retryLabel={t('customer.common.retry')}
                  >
                    {t('customer.booking.vehicleLoadError')}
                  </PageState>
                )}
                {vehicleState === 'ready' && availableVehicles.length === 0 && (
                  <PageState>
                    {t('customer.booking.noVehicles')}{' '}
                    <a className="booking-text-link" href="/customer/vehicles">
                      {t('customer.booking.addVehicle')}
                    </a>
                  </PageState>
                )}
                {vehicleState === 'ready' && availableVehicles.length > 0 && (
                  <>
                    <div className="booking-vehicle-grid">
                      {availableVehicles.map((vehicle) => {
                        const selected = selectedVehicleId === String(vehicle.vehicle_id)
                        return (
                          <label
                            className={`booking-vehicle-card${selected ? ' is-selected' : ''}${vehicle.selectable ? '' : ' is-unavailable'}`}
                            key={vehicle.vehicle_id}
                          >
                            <input
                              checked={selected}
                              disabled={!vehicle.selectable}
                              name="booking-vehicle"
                              onChange={() => chooseVehicle(vehicle)}
                              type="radio"
                              value={vehicle.vehicle_id}
                            />
                            <span className="booking-card-icon"><VehicleIcon /></span>
                            <span className="booking-vehicle-details">
                              <strong>{vehicleLabel(vehicle, t)}</strong>
                              {selected && (
                                <span className="booking-selection-label">
                                  {t('customer.booking.selectedVehicle')}
                                </span>
                              )}
                              <small>{vehicle.license_plate}</small>
                              <span>
                                {[vehicle.type_name, vehicle.production_year, vehicle.color]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                              {!vehicle.selectable && (
                                <em>
                                  {vehicle.status !== 'ACTIVE'
                                    ? t('customer.booking.vehicleInactive')
                                    : t('customer.booking.modelInactive')}
                                </em>
                              )}
                            </span>
                            <span aria-hidden="true" className="booking-radio-indicator" />
                          </label>
                        )
                      })}
                    </div>
                    {selectedVehicle && !vehicleTypeId && (
                      <p className="booking-inline-note" role="status">
                        {t('customer.booking.vehicleModelUnavailable')}
                      </p>
                    )}
                    {availableVehicles.length > 0 &&
                      !availableVehicles.some((vehicle) => vehicle.selectable) && (
                        <p className="booking-inline-note" role="status">
                          {t('customer.booking.noBookableVehicles')}{' '}
                          <a className="booking-text-link" href="/customer/vehicles">
                            {t('customer.vehicles.title')}
                          </a>.
                        </p>
                      )}
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="booking-step-content">
                {serviceState === 'loading' && (
                  <PageState>
                    <span className="customer-loader" />
                    {t('customer.booking.loadingServices')}
                  </PageState>
                )}
                {serviceState === 'error' && (
                  <PageState
                    error
                    onRetry={retryServices}
                    retryLabel={t('customer.common.retry')}
                  >
                    {t('customer.booking.serviceLoadError')}
                  </PageState>
                )}
                {serviceState === 'ready' && services.length === 0 && (
                  <PageState>{t('customer.booking.noActiveServices')}</PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'loading' && (
                  <PageState>
                    <span className="customer-loader" />
                    {t('customer.booking.loadingPrices')}
                  </PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'error' && (
                  <PageState
                    error
                    onRetry={retryPrices}
                    retryLabel={t('customer.common.retry')}
                  >
                    {t('customer.booking.priceLoadError')}
                  </PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'ready' && (
                  <>
                    <p className="booking-section-intro">
                      {t('customer.booking.serviceSelectionIntro')}
                    </p>
                    <div className="booking-service-list">
                      {services.map((service) => {
                        const serviceId = String(service.service_id)
                        const priceCents = servicePrices[serviceId]
                        const hasPrice = typeof priceCents === 'bigint'
                        const selected = selectedServiceIds.includes(serviceId)
                        return (
                          <label
                            className={`booking-service-card${selected ? ' is-selected' : ''}${hasPrice ? '' : ' is-unavailable'}`}
                            key={service.service_id}
                          >
                            <input
                              checked={selected}
                              disabled={!hasPrice}
                              onChange={() => toggleService(service.service_id)}
                              type="checkbox"
                            />
                            <span aria-hidden="true" className="booking-checkbox" />
                            <span className="booking-service-copy">
                              <strong>{service.service_name}</strong>
                              {selected && (
                                <small className="booking-selection-label">
                                  {t('customer.booking.selectedService')}
                                </small>
                              )}
                              <span>
                                {service.description?.trim() || t('customer.booking.noServiceDetails')}
                              </span>
                              <small>
                                {t('customer.booking.durationMinutes', {
                                  minutes: service.duration_minutes,
                                })}
                              </small>
                              {!hasPrice && (
                                <em>{t('customer.booking.unavailableVehicleType')}</em>
                              )}
                            </span>
                            <span className="booking-service-price">
                              {hasPrice ? formatCents(priceCents) : '—'}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="booking-total-bar">
                      <span>
                        {t(
                          selectedServiceIds.length === 1
                            ? 'customer.booking.serviceSelected'
                            : 'customer.booking.servicesSelected',
                          { count: selectedServiceIds.length },
                        )}
                        {totalDurationMinutes > 0 &&
                          ` · ${t('customer.booking.durationAbout', {
                            duration: formatDuration(totalDurationMinutes, t),
                          })}`}
                      </span>
                      <strong>{formatCents(totalCents)}</strong>
                    </div>
                    {selectedServiceIds.length > 0 && totalCents === 0n && (
                      <p className="booking-inline-note" role="status">
                        {t('customer.booking.totalMustBePositive')}
                      </p>
                    )}
                    {selectedServiceIds.length === 0 && (
                      <p className="booking-inline-note" role="status">
                        {t('customer.booking.selectPricedService')}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="booking-step-content">
                <div className="booking-range-control">
                  <div>
                    <strong>
                      {formatDate(scheduleRangeStart, language, t)} – {formatDate(rangeEnd, language, t)}
                    </strong>
                    <small>{t('customer.booking.availableDatesTimes')}</small>
                  </div>
                  <div className="booking-range-buttons">
                    <button
                      aria-label={t('customer.booking.browsePreviousDates')}
                      disabled={scheduleRangeStart <= today}
                      onClick={() => changeScheduleRange(-1)}
                      type="button"
                    >
                      ←
                    </button>
                    {scheduleRangeStart > today && (
                      <button
                        aria-label={t('customer.booking.returnToday')}
                        className="booking-today-button"
                        onClick={showToday}
                        type="button"
                      >
                        {t('customer.booking.today')}
                      </button>
                    )}
                    <button
                      aria-label={t('customer.booking.browseLaterDates')}
                      onClick={() => changeScheduleRange(1)}
                      type="button"
                    >
                      →
                    </button>
                  </div>
                </div>

                {scheduleState === 'loading' && (
                  <PageState>
                    <span className="customer-loader" />
                    {t('customer.booking.checkingDates')}
                  </PageState>
                )}
                {scheduleState === 'error' && (
                  <PageState
                    error
                    onRetry={retrySchedules}
                    retryLabel={t('customer.common.retry')}
                  >
                    {t('customer.booking.timeLoadError')}
                  </PageState>
                )}
                {scheduleState === 'ready' && schedules.length === 0 && (
                  <PageState>
                    {t('customer.booking.noTimesInRange')}
                  </PageState>
                )}
                {scheduleState === 'ready' && schedules.length > 0 && (
                  <>
                    <div
                      aria-label={t('customer.booking.datesWithSlots')}
                      className="booking-date-list"
                      role="group"
                    >
                      {availableDates.map((date) => {
                        const availableSlotCount = schedules.filter(
                          (schedule) => schedule.schedule_date === date,
                        ).filter(scheduleIsSelectable).length
                        return (
                          <button
                            aria-pressed={selectedDate === date}
                            className={`booking-date-option${selectedDate === date ? ' is-selected' : ''}`}
                            key={date}
                            onClick={() => {
                              setSelectedDate(date)
                              setSelectedScheduleId('')
                              setSubmitError('')
                            }}
                            type="button"
                          >
                            <strong>
                              {formatDate(date, language, t, { weekday: 'short' })}
                            </strong>
                            <span>
                              {formatDate(date, language, t, { day: 'numeric', month: 'short' })}
                            </span>
                            <small>
                              {availableSlotCount > 0
                                ? t(
                                  availableSlotCount === 1
                                    ? 'customer.booking.timeAvailable'
                                    : 'customer.booking.timesAvailable',
                                  { count: availableSlotCount },
                                )
                                : t('customer.booking.noAvailability')}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                    <h3 className="booking-time-heading">
                      {t('customer.booking.availableTimes')} ·{' '}
                      {selectedDate
                        ? formatDate(selectedDate, language, t)
                        : t('customer.booking.selectedDate')}
                    </h3>
                    {totalDurationMinutes > 90 && (
                      <p className="booking-inline-note" role="status">
                        {t('customer.booking.servicesLongNotice', {
                          duration: formatDuration(totalDurationMinutes, t),
                        })}
                      </p>
                    )}
                    <div className="booking-slot-table-wrap">
                      <table aria-label={t('customer.booking.availableTimes')} className="booking-slot-table">
                        <thead>
                          <tr>
                            <th scope="col">{t('customer.booking.timeColumn')}</th>
                            <th scope="col">{t('customer.booking.bookedColumn')}</th>
                            <th scope="col">{t('customer.booking.statusColumn')}</th>
                            <th scope="col">{t('customer.booking.actionColumn')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dateSchedules.map((schedule) => {
                            const selected = selectedScheduleId === String(schedule.schedule_id)
                            const selectable = scheduleIsSelectable(schedule)
                            const status = String(schedule.status ?? 'AVAILABLE').toUpperCase()
                            const full = status === 'FULL' ||
                              (status === 'AVAILABLE' && Number(schedule.remaining_capacity) === 0)
                            const past = status === 'PAST'
                            const unavailable = status !== 'AVAILABLE' && !full
                            const availabilityLabel = full
                              ? t('customer.booking.fullyBooked')
                              : past
                                ? t('customer.booking.slotPast')
                                : unavailable
                                  ? t('customer.booking.slotUnavailable')
                                  : t('customer.booking.spotsAvailable', {
                                    count: schedule.remaining_capacity,
                                  })
                            const bookedCount = Number(schedule.booked_count)
                            const capacity = Number(schedule.capacity)
                            const occupancy = capacity > 0
                              ? Math.min(100, Math.round((bookedCount / capacity) * 100))
                              : 100
                            const statusClass = full
                              ? 'is-full'
                              : past
                                ? 'is-past'
                                : unavailable
                                  ? 'is-unavailable'
                                  : 'is-available'
                            return (
                              <tr
                                className={`booking-slot-row${selected ? ' is-selected' : ''}`}
                                key={schedule.schedule_id}
                              >
                                <td className="booking-slot-time">
                                  <strong>{formatTime(schedule.start_time, t)}</strong>
                                  <span>– {formatTime(schedule.end_time, t)}</span>
                                </td>
                                <td>
                                  <div className="booking-occupancy">
                                    <strong
                                      aria-label={t('customer.booking.bookedCapacity', {
                                        booked: bookedCount,
                                        capacity,
                                      })}
                                    >
                                      {bookedCount} / {capacity}
                                    </strong>
                                    <span
                                      aria-hidden="true"
                                      className="booking-occupancy-meter"
                                    >
                                      <span style={{ width: `${occupancy}%` }} />
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className={`booking-slot-status ${statusClass}`}>
                                    {availabilityLabel}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    aria-label={t('customer.booking.slotLabel', {
                                      startTime: formatTime(schedule.start_time, t),
                                      endTime: formatTime(schedule.end_time, t),
                                      availability: availabilityLabel,
                                    })}
                                    aria-pressed={selected}
                                    className={`booking-slot booking-slot-select${selected ? ' is-selected' : ''}`}
                                    disabled={!selectable}
                                    onClick={() => chooseSchedule(schedule)}
                                    type="button"
                                  >
                                    {t(selected
                                      ? 'customer.booking.selectedTime'
                                      : 'customer.booking.selectTime')}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div aria-live="polite" className="booking-selected-appointment">
                      <strong>{t('customer.booking.selectedAppointment')}</strong>
                      <span>
                        {selectedSchedule
                          ? `${formatDate(selectedSchedule.schedule_date, language, t)} · ${formatTime(selectedSchedule.start_time, t)} – ${formatTime(selectedSchedule.end_time, t)}`
                          : t('customer.booking.chooseTime')}
                      </span>
                    </div>
                  </>
                )}
                {scheduleState === 'ready' &&
                  schedules.length > 0 &&
                  dateSchedules.length === 0 && (
                    <PageState>
                      {t('customer.booking.noSlotsForDate')}
                    </PageState>
                  )}
              </div>
            )}

            {step === 4 && (
              <div className="booking-step-content">
                <p className="booking-section-intro">
                  {t('customer.booking.reviewBeforeConfirming')}
                </p>
                <div className="booking-summary">
                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>01</span>
                      <h3>{t('customer.booking.vehicle')}</h3>
                      <button onClick={() => goToStep(1)} type="button">
                        {t('customer.booking.change')}
                      </button>
                    </div>
                    <div className="booking-summary-vehicle">
                      <span className="booking-card-icon"><VehicleIcon /></span>
                      <span>
                        <strong>
                          {selectedVehicle
                            ? vehicleLabel(selectedVehicle, t)
                            : t('customer.booking.vehicleUnavailable')}
                        </strong>
                        <small>
                          {selectedVehicle
                            ? [selectedVehicle.license_plate, selectedVehicle.type_name]
                              .filter(Boolean)
                              .join(' · ')
                            : t('customer.booking.selectVehicleAgain')}
                        </small>
                      </span>
                    </div>
                  </section>

                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>02</span>
                      <h3>{t('customer.booking.services')}</h3>
                      <button onClick={() => goToStep(2)} type="button">
                        {t('customer.booking.change')}
                      </button>
                    </div>
                    <ul className="booking-summary-services">
                      {selectedServices.map((service) => (
                        <li key={service.service_id}>
                          <span>
                            <strong>{service.service_name}</strong>
                            <small>
                              {t('customer.booking.durationMinutes', {
                                minutes: service.duration_minutes,
                              })}
                            </small>
                          </span>
                          <span>{formatCents(servicePrices[String(service.service_id)])}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>03</span>
                      <h3>{t('customer.booking.dateTime')}</h3>
                      <button onClick={() => goToStep(3)} type="button">
                        {t('customer.booking.change')}
                      </button>
                    </div>
                    <p className="booking-summary-appointment">
                      {selectedSchedule
                        ? `${formatDate(selectedSchedule.schedule_date, language, t)} · ${formatTime(selectedSchedule.start_time, t)} – ${formatTime(selectedSchedule.end_time, t)}`
                        : t('customer.booking.chooseAvailableTime')}
                    </p>
                  </section>

                  <section className="booking-summary-section booking-coupon">
                    <div className="booking-summary-heading">
                      <span>04</span>
                      <h3>{t('customer.booking.coupon')}</h3>
                    </div>
                    {activeCoupon ? (
                      <div className="booking-coupon-applied">
                        <span>
                          <strong>{activeCoupon.code}</strong>
                          {activeCoupon.description && <small>{activeCoupon.description}</small>}
                        </span>
                        <button disabled={submitting} onClick={removeCoupon} type="button">
                          {t('customer.booking.removeCoupon')}
                        </button>
                      </div>
                    ) : (
                      <>
                        {couponsState === 'idle' && (
                          <p className="booking-coupon-state" role="status">
                            {t('customer.booking.loadingCoupons')}
                          </p>
                        )}
                        {couponsState === 'error' && (
                          <div className="booking-coupon-state is-error" role="alert">
                            <span>{t('customer.booking.couponsLoadError')}</span>
                            <button onClick={retryCoupons} type="button">
                              {t('customer.common.retry')}
                            </button>
                          </div>
                        )}
                        {couponsState === 'ready' && availableCoupons.length === 0 && (
                          <p className="booking-coupon-state">
                            {t('customer.booking.noCoupons')}
                          </p>
                        )}
                        {couponsState === 'ready' && availableCoupons.length > 0 && (() => {
                          const chosen = availableCoupons.find(
                            (coupon) => coupon.coupon_code === selectedCouponCode,
                          )
                          const minimumCents = chosen ? amountToCents(chosen.min_order_amount) : null
                          const maxCents = chosen?.discount_type === 'PERCENT'
                            ? amountToCents(chosen.max_discount)
                            : null
                          return (
                            <div className="booking-coupon-picker">
                              <label className="booking-coupon-label" htmlFor="booking-coupon-select">
                                {t('customer.booking.couponSelectLabel', { count: availableCoupons.length })}
                              </label>
                              <div className="booking-coupon-row">
                                <select
                                  disabled={couponChecking || submitting}
                                  id="booking-coupon-select"
                                  onChange={(event) => {
                                    setSelectedCouponCode(event.target.value)
                                    setCouponError('')
                                  }}
                                  value={selectedCouponCode}
                                >
                                  <option value="">{t('customer.booking.couponSelectPlaceholder')}</option>
                                  {availableCoupons.map((coupon) => (
                                    <option key={coupon.coupon_id} value={coupon.coupon_code}>
                                      {coupon.coupon_code} · {t('customer.booking.couponOff', {
                                        amount: couponDiscountLabel(coupon),
                                      })}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  disabled={!chosen || couponChecking || submitting}
                                  onClick={() => {
                                    setCouponError('')
                                    void applyCoupon(chosen.coupon_code)
                                  }}
                                  type="button"
                                >
                                  {couponChecking
                                    ? t('customer.booking.checkingCoupon')
                                    : t('customer.booking.checkCoupon')}
                                </button>
                              </div>
                              {chosen && (
                                <p className="booking-coupon-detail">
                                  {chosen.description && <span>{chosen.description}</span>}
                                  <small>
                                    {[
                                      minimumCents !== null && minimumCents > 0n
                                        ? t('customer.booking.couponMinimum', { amount: formatCents(minimumCents) })
                                        : t('customer.booking.couponNoMinimum'),
                                      maxCents !== null
                                        ? t('customer.booking.couponMax', { amount: formatCents(maxCents) })
                                        : null,
                                    ].filter(Boolean).join(' · ')}
                                  </small>
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )}
                    {couponError && <p className="booking-coupon-error" role="alert">{couponError}</p>}
                  </section>

                  {activeCoupon && (
                    <div className="booking-summary-breakdown">
                      <span>{t('customer.booking.subtotal')}</span>
                      <span>{formatCents(totalCents)}</span>
                      <span>{t('customer.booking.couponDiscount')}</span>
                      <span>−{formatCents(activeCoupon.discountCents)}</span>
                    </div>
                  )}
                  <div className="booking-summary-total">
                    <span>{t('customer.booking.amountDue')}</span>
                    <strong>{formatCents(payableCents)}</strong>
                  </div>
                </div>
                <p className="booking-payment-note">
                  {t('customer.booking.paymentNote')}
                </p>
              </div>
            )}

            <div className="booking-panel-actions">
              {step > 1 ? (
                <button
                  className="booking-secondary-button"
                  disabled={submitting}
                  onClick={() => goToStep(step - 1)}
                  type="button"
                >
                  {t('customer.booking.back')}
                </button>
              ) : (
                <a className="booking-secondary-link" href="/customer">
                  {t('customer.common.cancel')}
                </a>
              )}
              {step < 4 ? (
                <button
                  className="customer-button customer-button-primary"
                  disabled={!canContinue}
                  onClick={() => moveToStep(step + 1)}
                  type="button"
                >
                  {t('customer.booking.continue')}
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button
                  className="customer-button customer-button-primary"
                  disabled={
                    submitting ||
                    !selectedVehicle ||
                    !selectedSchedule ||
                    !scheduleIsSelectable(selectedSchedule) ||
                    selectedServices.length === 0 ||
                    priceState !== 'ready' ||
                    totalCents <= 0n
                  }
                  onClick={confirmBooking}
                  type="button"
                >
                  {submitting
                    ? t('customer.booking.confirming')
                    : t('customer.booking.confirm')}
                  {!submitting && <span aria-hidden="true">→</span>}
                </button>
              )}
            </div>
          </section>
          <p className="booking-security-note">
            <span aria-hidden="true">✓</span>
            {t('customer.booking.securityNote')}
          </p>
            </>
          )}
        </div>
      </main>

      <CustomerFooter />
    </div>
  )
}

export default CustomerBookingPage
