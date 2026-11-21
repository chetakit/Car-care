import { useRef, useState } from 'react'
import { ApiError, apiRequest } from '../Admin/api/client.js'
import PasswordField from './PasswordField.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10}$/
// Same rule as the backend (customerRegistrationValidator.js).
const MIN_PASSWORD_LENGTH = 8

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

  if (passwordLength < MIN_PASSWORD_LENGTH || password.length > 1024) {
    return 'auth.register.validation.passwordLength'
  }

  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    return 'auth.register.validation.phone'
  }

  return ''
}

// Sign-up form shown in the garage's headlight. On success it switches the
// page to /login with a "registration complete" note, as before.
function RegisterForm({ onSwitch, onFail }) {
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
      onFail?.()
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
        throw new Error('auth.error.registrationResponseMissingCustomer')
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
        registrationError instanceof ApiError && registrationError.status === 429
          ? t('auth.error.tooManyAttempts', {
              minutes: Math.max(1, Math.ceil((registrationError.payload?.retry_after_seconds || 60) / 60)),
            })
          : registrationError instanceof ApiError
          ? registrationError.message
          : registrationError.message || 'auth.register.error',
      )
      onFail?.()
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
      <span className="garage-kicker">{t('auth.register.eyebrow')}</span>
      <h1 id="garage-form-title">{t('auth.register.title')}</h1>
      <p className="garage-description">{t('auth.register.description')}</p>

      {error && (
        <div className="garage-error" role="alert">
          {displayError(error)}
        </div>
      )}

      <form className="garage-form" noValidate onSubmit={handleSubmit}>
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
              setPhone(event.target.value.replace(/[^0-9]/g, '').slice(0, 10))
              setError('')
            }}
            type="tel"
            value={phone}
          />
        </label>

        <PasswordField
          autoComplete="new-password"
          hint={t('auth.register.passwordHint')}
          label={t('auth.register.password')}
          maxLength={1024}
          onChange={(event) => {
            setPassword(event.target.value)
            setError('')
          }}
          value={password}
        />

        <button className="garage-submit" disabled={submitting} type="submit">
          {submitting ? t('auth.register.submitting') : t('auth.register.submit')}
          {!submitting && <span aria-hidden="true" className="garage-submit-arrow">→</span>}
        </button>
      </form>

      <p className="garage-switch">
        {t('auth.register.alreadyHaveAccount')}{' '}
        <a href="/login" onClick={(event) => onSwitch?.(event, '/login')}>
          {t('auth.register.signIn')}
        </a>
      </p>
    </>
  )
}

export default RegisterForm
