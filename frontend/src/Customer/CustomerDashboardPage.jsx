import { useEffect, useMemo, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import {
  CUSTOMER_TIME_ZONE,
  formatCustomerDate,
  formatCustomerTime,
} from './customerFormatters.js'
import './customer.css'
import './dashboard.css'

const BUSINESS_TIME_ZONE = CUSTOMER_TIME_ZONE
const BOOKING_PAGE_SIZE = 100
const UPCOMING_STATUSES = new Set(['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'])

function getBusinessClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  }
}

function findUpcomingBooking(bookings, now = new Date()) {
  const clock = getBusinessClock(now)
  return bookings
    .filter((booking) => {
      const date = String(booking.booking_date ?? '').slice(0, 10)
      const time = String(booking.start_time ?? '').slice(0, 8)
      return (
        UPCOMING_STATUSES.has(String(booking.booking_status).toUpperCase()) &&
        date &&
        time &&
        (date > clock.date || (date === clock.date && time > clock.time))
      )
    })
    .sort((left, right) => {
      const leftDate = `${left.booking_date} ${left.start_time}`
      const rightDate = `${right.booking_date} ${right.start_time}`
      return leftDate.localeCompare(rightDate)
    })[0] ?? null
}

function vehicleName(vehicle, unavailableLabel) {
  return [vehicle?.brand_name, vehicle?.model_name].filter(Boolean).join(' ') || unavailableLabel
}

function CustomerDashboardPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const { language, t } = useLanguage()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [vehicles, setVehicles] = useState([])
  const [vehicleState, setVehicleState] = useState('loading')
  const [vehicleReload, setVehicleReload] = useState(0)
  const [upcomingBooking, setUpcomingBooking] = useState(null)
  const [hasMoreBookings, setHasMoreBookings] = useState(false)
  const [bookingState, setBookingState] = useState('loading')
  const [bookingReload, setBookingReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    api('/api/customer/vehicles', { signal: controller.signal })
      .then((response) => {
        const items = response.data?.items
        if (!Array.isArray(items)) {
          throw new Error('The vehicle list returned an invalid response.')
        }
        setVehicles(items)
        setVehicleState(items.length > 0 ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setVehicleState('error')
      })

    return () => controller.abort()
  }, [api, vehicleReload])

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: '1',
      limit: String(BOOKING_PAGE_SIZE),
      sort: 'newest',
    })

    api(`/api/customer/bookings?${query.toString()}`, {
      signal: controller.signal,
    })
      .then((response) => {
        const data = response.data
        const items = data?.items
        const total = Number(data?.pagination?.total)
        if (!Array.isArray(items) || !Number.isInteger(total) || total < 0) {
          throw new Error('The bookings response is incomplete.')
        }
        setUpcomingBooking(findUpcomingBooking(items))
        setHasMoreBookings(total > items.length)
        setBookingState('ready')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setBookingState('error')
      })

    return () => controller.abort()
  }, [api, bookingReload])

  const firstName =
    user?.full_name?.trim().split(/\s+/)[0] || t('customer.dashboard.greetingFallback')

  return (
    <div className="customer-home customer-dashboard">
      <CustomerHeader onLogout={onLogout} user={user} />

      <main className="dashboard-main" id="dashboard-home">
        <div className="customer-container">
          <header className="dashboard-heading">
            <div>
              <span className="customer-eyebrow">{t('customer.dashboard.eyebrow')}</span>
              <h1>{t('customer.dashboard.welcome', { name: firstName })}</h1>
              <p>{t('customer.dashboard.intro')}</p>
            </div>
            <a className="customer-button customer-button-primary" href="/customer/booking">
              {t('customer.common.bookService')}
              <span aria-hidden="true">→</span>
            </a>
          </header>

          <div className="dashboard-sections">
            <section aria-labelledby="dashboard-vehicles-title" className="dashboard-section">
              <header className="dashboard-section-heading">
                <div>
                  <span className="customer-eyebrow">
                    {t('customer.vehicles.eyebrow')}
                  </span>
                  <h2 id="dashboard-vehicles-title">
                    {t('customer.dashboard.yourVehicles')}
                  </h2>
                </div>
                <a className="dashboard-section-link" href="/customer/vehicles">
                  {t('customer.dashboard.manageVehicles')}
                  <span aria-hidden="true">→</span>
                </a>
              </header>

              {vehicleState === 'loading' && (
                <div aria-live="polite" className="dashboard-state">
                  <span className="customer-loader" />
                  <span>{t('customer.dashboard.loadingVehicles')}</span>
                </div>
              )}
              {vehicleState === 'error' && (
                <div className="dashboard-state dashboard-state-error" role="alert">
                  <p>{t('customer.dashboard.loadVehiclesError')}</p>
                  <button
                    onClick={() => {
                      setVehicleState('loading')
                      setVehicleReload((value) => value + 1)
                    }}
                    type="button"
                  >
                    {t('customer.common.retry')}
                  </button>
                </div>
              )}
              {vehicleState === 'empty' && (
                <div className="dashboard-state dashboard-state-empty">
                  <p>
                    {t('customer.dashboard.vehicleEmpty')}
                  </p>
                  <a href="/customer/vehicles">
                    {t('customer.dashboard.addFirstVehicle')}
                  </a>
                </div>
              )}
              {vehicleState === 'ready' && (
                <ul className="dashboard-vehicle-list">
                  {vehicles.slice(0, 3).map((vehicle) => (
                    <li key={vehicle.vehicle_id}>
                      <div>
                        <strong>
                          {vehicleName(vehicle, t('customer.common.notAvailable'))}
                        </strong>
                        <span>
                          {[vehicle.type_name, vehicle.production_year]
                            .filter(Boolean)
                            .join(' · ') || t('customer.dashboard.vehicleDetails')}
                        </span>
                      </div>
                      <span className="dashboard-license-plate">
                        {vehicle.license_plate || t('customer.dashboard.plateNotListed')}
                      </span>
                    </li>
                  ))}
                  {vehicles.length > 3 && (
                    <li className="dashboard-more-vehicles">
                      <span>
                        {t('customer.dashboard.moreVehicles', {
                          count: vehicles.length - 3,
                        })}
                      </span>
                      <a href="/customer/vehicles">{t('customer.dashboard.viewAll')}</a>
                    </li>
                  )}
                </ul>
              )}
            </section>

            <section aria-labelledby="dashboard-upcoming-title" className="dashboard-section">
              <header className="dashboard-section-heading">
                <div>
                  <span className="customer-eyebrow">
                    {t('customer.dashboard.nextVisit')}
                  </span>
                  <h2 id="dashboard-upcoming-title">
                    {t('customer.dashboard.upcomingBooking')}
                  </h2>
                </div>
                <a className="dashboard-section-link" href="/customer/bookings">
                  {t('customer.common.myBookings')}
                  <span aria-hidden="true">→</span>
                </a>
              </header>

              {bookingState === 'loading' && (
                <div aria-live="polite" className="dashboard-state">
                  <span className="customer-loader" />
                  <span>{t('customer.dashboard.loadingBookings')}</span>
                </div>
              )}
              {bookingState === 'error' && (
                <div className="dashboard-state dashboard-state-error" role="alert">
                  <p>{t('customer.dashboard.loadBookingsError')}</p>
                  <button
                    onClick={() => {
                      setBookingState('loading')
                      setBookingReload((value) => value + 1)
                    }}
                    type="button"
                  >
                    {t('customer.common.retry')}
                  </button>
                </div>
              )}
              {bookingState === 'ready' && upcomingBooking && (
                <article className="dashboard-upcoming">
                  <p className="dashboard-upcoming-date">
                    {formatCustomerDate(upcomingBooking.booking_date, language)}
                  </p>
                  <p className="dashboard-upcoming-time">
                    {formatCustomerTime(upcomingBooking.start_time, language)}
                    {upcomingBooking.end_time &&
                      ` – ${formatCustomerTime(upcomingBooking.end_time, language)}`}
                  </p>
                  <div className="dashboard-upcoming-details">
                    <span>
                      {vehicleName(
                        upcomingBooking.vehicle,
                        t('customer.common.notAvailable'),
                      )}
                      {upcomingBooking.vehicle?.license_plate
                        ? ` · ${upcomingBooking.vehicle.license_plate}`
                        : ''}
                    </span>
                    <span>
                      {Array.isArray(upcomingBooking.services) &&
                      upcomingBooking.services.length > 0
                        ? upcomingBooking.services
                            .map((service) => service.service_name)
                            .filter(Boolean)
                            .join(', ')
                        : t('customer.dashboard.serviceDetailsUnavailable')}
                    </span>
                  </div>
                  <a href="/customer/bookings">
                    {t('customer.dashboard.viewBookingDetails')}
                  </a>
                </article>
              )}
              {bookingState === 'ready' && !upcomingBooking && (
                <div className="dashboard-state dashboard-state-empty">
                  <p>
                    {hasMoreBookings
                      ? t('customer.dashboard.noUpcomingRecent')
                      : t('customer.dashboard.noUpcoming')}
                  </p>
                  <a href={hasMoreBookings ? '/customer/bookings' : '/customer/booking'}>
                    {hasMoreBookings
                      ? t('customer.dashboard.reviewBookings')
                      : t('customer.common.bookService')}
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default CustomerDashboardPage
