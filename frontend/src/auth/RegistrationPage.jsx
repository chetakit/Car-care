import { useRef, useState } from 'react'
import { ApiError, apiRequest } from '../Admin/api/client.js'
import CustomerHeader from '../Customer/CustomerHeader.jsx'
import AuthShowcase from './AuthShowcase.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import './auth.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10}$/

function getRegistrationError({ fullName, email, password, phone }) {
  const normalizedName = fullName.trim()
  const normalizedEmail = email.trim()
  const passwordLength = Array.from(password).length

  if (!normalizedName || !normalizedEmail || passwordLength === 0) {
    return 'auth.register.validation.required'
  }

  if (
    Array.from(normalizedName).length > 100 ||
    normalizedEmail.length > 150 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    return 'auth.register.validation.nameEmail'
  }

  if (password.length > 1024) {
    return 'auth.register.validation.passwordLength'
  }

  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    return 'auth.register.validation.phone'
  }

  return ''
}

function RegistrationPage({ onNavigate }) {
  const { t } = useLanguage()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionInProgress = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionInProgress.current) return

    const formValues = { fullName, email, password, phone }
    const validationError = getRegistrationError(formValues)

    if (validationError) {
      setError(validationError)
      return
    }

    submissionInProgress.current = true
    setSubmitting(true)
    setError('')

    const body = {
      full_name: fullName.trim(),
      email: email.trim(),
      password,
      ...(phone !== '' ? { phone } : {}),
    }

    try {
      const response = await apiRequest('/api/customer/auth/register', {
        method: 'POST',
        body,
      })

      if (response.data?.user?.role !== 'CUSTOMER') {
        throw new Error(
          'The registration response did not include the created customer account.',
        )
      }

      const currentState = window.history.state

      window.history.replaceState(
        {
          ...(currentState && typeof currentState === 'object'
            ? currentState
            : {}),
          registrationSuccess: true,
        },
        '',
        '/login',
      )

      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (registrationError) {
      setError(
        registrationError instanceof ApiError
          ? registrationError.message
          : registrationError.message || 'auth.register.error',
      )
    } finally {
      submissionInProgress.current = false
      setSubmitting(false)
    }
  }

  function displayError(message) {
    if (!message) return ''
    return message.startsWith('auth.') ? t(message) : message
  }

  return (
    <>
      <CustomerHeader bookingAvailable={false} user={null} />
      <main className="shared-auth-page">
        <div className="shared-auth-layout">
          <AuthShowcase />

          <section
            aria-labelledby="registration-title"
            className="shared-auth-card"
          >
            <LanguageToggle />

            <span className="shared-auth-kicker">
              {t('auth.register.eyebrow')}
            </span>

            <h1 id="registration-title">
              {t('auth.register.title')}
            </h1>

            <p className="shared-auth-description">
              {t('auth.register.description')}
            </p>

            {error && (
              <div className="shared-auth-error" role="alert">
                {displayError(error)}
              </div>
            )}

            <form className="shared-auth-form" noValidate onSubmit={handleSubmit}>
              <label>
                {t('auth.register.fullName')}
                <input
                  autoComplete="name"
                  onChange={(event) => {
                    setFullName(event.target.value)
                    setError('')
                  }}
                  type="text"
                  value={fullName}
                />
              </label>

              <label>
                {t('auth.register.email')}
                <input
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setError('')
                  }}
                  type="email"
                  value={email}
                />
              </label>

              <label>
                {t('auth.register.phoneOptional')}
                <input
                  autoComplete="tel"
                  inputMode="numeric"
                  onChange={(event) => {
                    setPhone(
                      event.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                    )
                    setError('')
                  }}
                  type="tel"
                  value={phone}
                />
              </label>

              <label>
                {t('auth.register.password')}
                <input
                  autoComplete="new-password"
                  maxLength={1024}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  type="password"
                  value={password}
                />
              </label>

              <button disabled={submitting} type="submit">
                {submitting
                  ? t('auth.register.submitting')
                  : t('auth.register.submit')}
                {!submitting && (
                  <span
                    aria-hidden="true"
                    className="shared-auth-submit-arrow"
                  >
                    →
                  </span>
                )}
              </button>
            </form>

            <p className="shared-auth-account-link">
              {t('auth.register.alreadyHaveAccount')}{' '}
              <a
                href="/login"
                onClick={(event) => onNavigate?.(event, '/login')}
              >
                {t('auth.register.signIn')}
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}

export default RegistrationPage
