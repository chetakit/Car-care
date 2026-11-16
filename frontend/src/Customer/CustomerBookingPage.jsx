import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import formatMoney from '../Admin/utils/formatMoney.js'
import useAuth from '../auth/useAuth.js'
import CustomerHeader, { BrandMark } from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import './customer.css'
import './booking.css'

const BOOKING_WINDOW_DAYS = 14
const STEPS = [
  ['Vehicle', 'Choose your vehicle'],
  ['Services', 'Choose services'],
  ['Date & time', 'Choose an available slot'],
  ['Summary', 'Review and confirm'],
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

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(year, month - 1, day),
  )
}

function formatTime(value) {
  const time = String(value ?? '').slice(0, 5)
  return time || 'Time unavailable'
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

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function centsToAmount(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

function amountToCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ''))
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}

function vehicleLabel(vehicle) {
  return [vehicle.brand_name, vehicle.model_name].filter(Boolean).join(' ') || 'Vehicle'
}

function scheduleIsSelectable(schedule) {
  const status = String(schedule.status ?? 'AVAILABLE').toUpperCase()
  return status === 'AVAILABLE' && Number(schedule.remaining_capacity) > 0
}

function getBookingErrorMessage(error) {
  const message = error.message || 'Unable to create your booking. Please try again.'
  if (!(error instanceof ApiError)) return message

  if (error.status === 409 && /schedule|capacity/i.test(message)) {
    return 'That time is no longer available. Choose another open time to continue.'
  }
  if (error.status === 409 && /vehicle|model|type/i.test(message)) {
    return 'This vehicle is no longer available for booking. Choose another active vehicle.'
  }
  if (error.status === 409 && /price/i.test(message)) {
    return 'A selected service no longer has a price for this vehicle. Review the services before continuing.'
  }
  if (error.status === 400 && /schedule duration/i.test(message)) {
    return 'The selected services take longer than this time slot. Choose fewer services or another slot.'
  }
  if (error.status === 400 && /final_amount|greater than zero/i.test(message)) {
    return 'Your service total must be greater than zero. Select a service with a positive price.'
  }
  return message
}

function PageState({ children, error = false, onRetry, retryLabel = 'Try again' }) {
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
  const [scheduleRangeStart, setScheduleRangeStart] = useState(() =>
    localDateString(new Date()),
  )
  const [schedules, setSchedules] = useState([])
  const [scheduleState, setScheduleState] = useState('idle')
  const [scheduleReload, setScheduleReload] = useState(0)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedScheduleId, setSelectedScheduleId] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponError, setCouponError] = useState('')
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
  }, [api, rangeEnd, scheduleRangeStart, scheduleReload, scheduleState, step, totalDurationMinutes])

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

  async function applyCoupon() {
    const code = couponInput.trim()
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
      setCouponInput(response.data.coupon_code)
    } catch (error) {
      setAppliedCoupon(null)
      setCouponError(error instanceof Error ? error.message : 'This coupon could not be checked.')
    } finally {
      setCouponChecking(false)
    }
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
      setSubmitError(getBookingErrorMessage(error))
      if (error instanceof ApiError && /coupon/i.test(error.message)) {
        setAppliedCoupon(null)
        setCouponError(error.message)
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
          <nav aria-label="Breadcrumb" className="booking-breadcrumb">
            <a href="/customer">Home</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Book a service</span>
          </nav>

          <header className="booking-heading">
            {bookingResult ? (
              <div>
                <span className="customer-eyebrow">AWAITING PAYMENT</span>
                <h1>Booking created</h1>
                <p>Reference #{bookingResult.bookingId}. Pay within 15 minutes to confirm it.</p>
              </div>
            ) : (
              <>
                <div>
                  <span className="customer-eyebrow">CARE THAT FITS YOUR JOURNEY</span>
                  <h1>Book a service</h1>
                  <p>Choose your vehicle, select services, and find a time that works for you.</p>
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
                <h2 id="booking-success-title">Your slot is held for 15 minutes.</h2>
                <p>
                  The booking is confirmed only after payment. If it is not paid within
                  15 minutes, it is cancelled automatically and the slot is released.
                </p>
                <div className="booking-success-actions">
                  <a
                    className="customer-button customer-button-primary"
                    href={`/customer/payment/${encodeURIComponent(bookingResult.bookingId)}`}
                  >
                    Pay now
                    <span aria-hidden="true">→</span>
                  </a>
                  <a className="booking-secondary-link" href="/customer/bookings">
                    View My Bookings
                  </a>
                </div>
              </div>
            </section>
          ) : (
            <>
          <nav aria-label="Booking steps" className="booking-steps">
            {STEPS.map(([title, description], index) => {
              const stepNumber = index + 1
              const complete = stepNumber < step
              return (
                <button
                  aria-label={`Step ${stepNumber} of ${STEPS.length}: ${title}. ${description}${complete ? '. Completed' : ''}`}
                  aria-current={stepNumber === step ? 'step' : undefined}
                  className={`booking-step${stepNumber === step ? ' is-current' : ''}${complete ? ' is-complete' : ''}`}
                  disabled={stepNumber >= step}
                  key={title}
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
                <span className="booking-panel-kicker">STEP 0{step} / 04</span>
                <h2 id="booking-panel-title">{STEPS[step - 1][1]}</h2>
              </div>
              <span className="booking-panel-note">Your booking is confirmed once it is paid.</span>
            </div>

            {step === 1 && (
              <div className="booking-step-content">
                {vehicleState === 'loading' && (
                  <PageState><span className="customer-loader" /> Loading your vehicles…</PageState>
                )}
                {vehicleState === 'error' && (
                  <PageState error onRetry={retryVehicles}>
                    We couldn’t load your vehicles and vehicle models.
                  </PageState>
                )}
                {vehicleState === 'ready' && availableVehicles.length === 0 && (
                  <PageState>
                    No vehicles are registered to your account yet.
                    <a className="booking-text-link" href="/customer/vehicles">Add a vehicle</a>
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
                              <strong>{vehicleLabel(vehicle)}</strong>
                              {selected && (
                                <span className="booking-selection-label">Selected vehicle</span>
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
                                    ? 'This vehicle is not active.'
                                    : 'This vehicle model is not active in the catalog.'}
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
                        The selected vehicle’s active model details could not be found. Choose another vehicle or update it in My Vehicles.
                      </p>
                    )}
                    {availableVehicles.length > 0 &&
                      !availableVehicles.some((vehicle) => vehicle.selectable) && (
                        <p className="booking-inline-note" role="status">
                          None of your vehicles can be booked right now. Update a vehicle or add one with an active model in{' '}
                          <a className="booking-text-link" href="/customer/vehicles">My Vehicles</a>.
                        </p>
                      )}
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="booking-step-content">
                {serviceState === 'loading' && (
                  <PageState><span className="customer-loader" /> Loading available services…</PageState>
                )}
                {serviceState === 'error' && (
                  <PageState error onRetry={retryServices}>
                    We couldn’t load the service catalog.
                  </PageState>
                )}
                {serviceState === 'ready' && services.length === 0 && (
                  <PageState>No active services are available right now.</PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'loading' && (
                  <PageState><span className="customer-loader" /> Loading prices for your vehicle…</PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'error' && (
                  <PageState error onRetry={retryPrices}>
                    We couldn’t load prices for your vehicle type.
                  </PageState>
                )}
                {serviceState === 'ready' && services.length > 0 && priceState === 'ready' && (
                  <>
                    <p className="booking-section-intro">
                      Select one or more services. Prices and durations are confirmed by the service catalog.
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
                                <small className="booking-selection-label">Selected service</small>
                              )}
                              <span>{service.description?.trim() || 'No additional service details are listed.'}</span>
                              <small>{service.duration_minutes} min</small>
                              {!hasPrice && (
                                <em>Not available for this vehicle type</em>
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
                        {selectedServiceIds.length} {selectedServiceIds.length === 1 ? 'service' : 'services'} selected
                        {totalDurationMinutes > 0 && ` · about ${formatDuration(totalDurationMinutes)}`}
                      </span>
                      <strong>{formatCents(totalCents)}</strong>
                    </div>
                    {selectedServiceIds.length > 0 && totalCents === 0n && (
                      <p className="booking-inline-note" role="status">
                        The booking total must be greater than zero. Select at least one service with a positive price.
                      </p>
                    )}
                    {selectedServiceIds.length === 0 && (
                      <p className="booking-inline-note" role="status">
                        Choose at least one service with a listed price to continue.
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
                    <strong>{formatDate(scheduleRangeStart)} – {formatDate(rangeEnd)}</strong>
                    <small>Available dates and times</small>
                  </div>
                  <div className="booking-range-buttons">
                    <button
                      aria-label="Browse previous dates"
                      disabled={scheduleRangeStart <= today}
                      onClick={() => changeScheduleRange(-1)}
                      type="button"
                    >
                      ←
                    </button>
                    {scheduleRangeStart > today && (
                      <button
                        aria-label="Return to dates starting today"
                        className="booking-today-button"
                        onClick={showToday}
                        type="button"
                      >
                        Today
                      </button>
                    )}
                    <button
                      aria-label="Browse later dates"
                      onClick={() => changeScheduleRange(1)}
                      type="button"
                    >
                      →
                    </button>
                  </div>
                </div>

                {scheduleState === 'loading' && (
                  <PageState><span className="customer-loader" /> Checking available dates…</PageState>
                )}
                {scheduleState === 'error' && (
                  <PageState error onRetry={retrySchedules}>
                    We couldn’t load available times.
                  </PageState>
                )}
                {scheduleState === 'ready' && schedules.length === 0 && (
                  <PageState>
                    No available times in this date range. Browse later dates to continue.
                  </PageState>
                )}
                {scheduleState === 'ready' && schedules.length > 0 && (
                  <>
                    <div
                      aria-label="Dates with returned time slots"
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
                            <strong>{formatDate(date, { weekday: 'short' })}</strong>
                            <span>{formatDate(date, { day: 'numeric', month: 'short' })}</span>
                            <small>
                              {availableSlotCount > 0
                                ? `${availableSlotCount} ${availableSlotCount === 1 ? 'time' : 'times'} available`
                                : 'No availability'}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                    <h3 className="booking-time-heading">
                      Available times · {selectedDate ? formatDate(selectedDate) : 'selected date'}
                    </h3>
                    {totalDurationMinutes > 90 && (
                      <p className="booking-inline-note" role="status">
                        Your services take about {formatDuration(totalDurationMinutes)}, so each visit uses more than one time slot. Only start times with enough free time after them are shown.
                      </p>
                    )}
                    <div className="booking-slot-grid">
                      {dateSchedules.map((schedule) => {
                        const selected = selectedScheduleId === String(schedule.schedule_id)
                        const selectable = scheduleIsSelectable(schedule)
                        const full = Number(schedule.remaining_capacity) === 0
                        const unavailable =
                          String(schedule.status ?? 'AVAILABLE').toUpperCase() !== 'AVAILABLE'
                        return (
                          <button
                            aria-label={`${formatTime(schedule.start_time)} to ${formatTime(schedule.end_time)}. ${
                              full
                                ? 'Fully booked'
                                : unavailable
                                  ? 'Unavailable'
                                  : `${schedule.remaining_capacity} spots available`
                            }`}
                            aria-pressed={selected}
                            className={`booking-slot${selectable ? ' is-available' : ''}${selected ? ' is-selected' : ''}${full ? ' is-full' : ''}${unavailable && !full ? ' is-unavailable' : ''}`}
                            disabled={!selectable}
                            key={schedule.schedule_id}
                            onClick={() => chooseSchedule(schedule)}
                            type="button"
                          >
                            <strong>{formatTime(schedule.start_time)}</strong>
                            <span>to {formatTime(schedule.end_time)}</span>
                            <small>
                              {full
                                ? 'Fully booked'
                                : unavailable
                                  ? 'Unavailable'
                                  : `${schedule.remaining_capacity} ${
                                      Number(schedule.remaining_capacity) === 1 ? 'spot' : 'spots'
                                    } left`}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                    <div aria-live="polite" className="booking-selected-appointment">
                      <strong>Selected appointment</strong>
                      <span>
                        {selectedSchedule
                          ? `${formatDate(selectedSchedule.schedule_date)} · ${formatTime(selectedSchedule.start_time)} – ${formatTime(selectedSchedule.end_time)}`
                          : 'Choose an available time to continue.'}
                      </span>
                    </div>
                  </>
                )}
                {scheduleState === 'ready' &&
                  schedules.length > 0 &&
                  dateSchedules.length === 0 && (
                    <PageState>
                      No time slots are listed for this date. Choose another date or browse a later range.
                    </PageState>
                  )}
              </div>
            )}

            {step === 4 && (
              <div className="booking-step-content">
                <p className="booking-section-intro">
                  Please review the details before confirming your appointment.
                </p>
                <div className="booking-summary">
                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>01</span>
                      <h3>Vehicle</h3>
                      <button onClick={() => goToStep(1)} type="button">Change</button>
                    </div>
                    <div className="booking-summary-vehicle">
                      <span className="booking-card-icon"><VehicleIcon /></span>
                      <span>
                        <strong>{selectedVehicle ? vehicleLabel(selectedVehicle) : 'Vehicle unavailable'}</strong>
                        <small>
                          {selectedVehicle
                            ? [selectedVehicle.license_plate, selectedVehicle.type_name]
                              .filter(Boolean)
                              .join(' · ')
                            : 'Go back and select a vehicle.'}
                        </small>
                      </span>
                    </div>
                  </section>

                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>02</span>
                      <h3>Services</h3>
                      <button onClick={() => goToStep(2)} type="button">Change</button>
                    </div>
                    <ul className="booking-summary-services">
                      {selectedServices.map((service) => (
                        <li key={service.service_id}>
                          <span>
                            <strong>{service.service_name}</strong>
                            <small>{service.duration_minutes} min</small>
                          </span>
                          <span>{formatCents(servicePrices[String(service.service_id)])}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="booking-summary-section">
                    <div className="booking-summary-heading">
                      <span>03</span>
                      <h3>Date &amp; time</h3>
                      <button onClick={() => goToStep(3)} type="button">Change</button>
                    </div>
                    <p className="booking-summary-appointment">
                      {selectedSchedule
                        ? `${formatDate(selectedSchedule.schedule_date)} · ${formatTime(selectedSchedule.start_time)} – ${formatTime(selectedSchedule.end_time)}`
                        : 'Go back and choose an available time.'}
                    </p>
                  </section>

                  <section className="booking-summary-section booking-coupon">
                    <div className="booking-summary-heading">
                      <span>04</span>
                      <h3>Coupon</h3>
                    </div>
                    {activeCoupon ? (
                      <div className="booking-coupon-applied">
                        <span>
                          <strong>{activeCoupon.code}</strong>
                          {activeCoupon.description && <small>{activeCoupon.description}</small>}
                        </span>
                        <button disabled={submitting} onClick={removeCoupon} type="button">Remove</button>
                      </div>
                    ) : (
                      <div className="booking-coupon-form">
                        <label className="booking-visually-hidden" htmlFor="booking-coupon-code">Coupon code</label>
                        <input
                          autoComplete="off"
                          disabled={couponChecking || submitting}
                          id="booking-coupon-code"
                          maxLength="50"
                          onChange={(event) => { setCouponInput(event.target.value); setCouponError('') }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') { event.preventDefault(); void applyCoupon() }
                          }}
                          placeholder="Have a coupon code?"
                          value={couponInput}
                        />
                        <button
                          disabled={!couponInput.trim() || couponChecking || submitting}
                          onClick={() => void applyCoupon()}
                          type="button"
                        >
                          {couponChecking ? 'Checking…' : 'Apply'}
                        </button>
                      </div>
                    )}
                    {couponError && <p className="booking-coupon-error" role="alert">{couponError}</p>}
                  </section>

                  {activeCoupon && (
                    <div className="booking-summary-breakdown">
                      <span>Subtotal</span><span>{formatCents(totalCents)}</span>
                      <span>Coupon discount</span><span>−{formatCents(activeCoupon.discountCents)}</span>
                    </div>
                  )}
                  <div className="booking-summary-total">
                    <span>Amount due</span>
                    <strong>{formatCents(payableCents)}</strong>
                  </div>
                </div>
                <p className="booking-payment-note">
                  After booking, pay online within 15 minutes to confirm your slot. Unpaid bookings are cancelled automatically.
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
                  Back
                </button>
              ) : (
                <a className="booking-secondary-link" href="/customer">
                  Cancel
                </a>
              )}
              {step < 4 ? (
                <button
                  className="customer-button customer-button-primary"
                  disabled={!canContinue}
                  onClick={() => moveToStep(step + 1)}
                  type="button"
                >
                  Continue
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
                  {submitting ? 'Confirming…' : 'Confirm booking'}
                  {!submitting && <span aria-hidden="true">→</span>}
                </button>
              )}
            </div>
          </section>
          <p className="booking-security-note">
            <span aria-hidden="true">✓</span>
            Your appointment details are verified securely before booking.
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
