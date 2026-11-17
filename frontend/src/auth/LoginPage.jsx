import { useState } from 'react'
import { ApiError } from '../Admin/api/client.js'
import CustomerHeader from '../Customer/CustomerHeader.jsx'
import useAuth from './useAuth.js'
import AuthShowcase from './AuthShowcase.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import LanguageToggle from '../i18n/LanguageToggle.jsx'
import './auth.css'

function LoginPage({ registrationSuccess = false, onNavigate }) {
  const { login, authError, clearAuthError } = useAuth()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function clearValidationError() {
    setError((currentError) =>
      currentError.startsWith('auth.login.validation.') ? '' : currentError,
    )
  }

  function handleEmailInvalid(event) {
    event.preventDefault()
    setError(
      event.currentTarget.validity.valueMissing
        ? 'auth.login.validation.emailRequired'
        : 'auth.login.validation.emailInvalid',
    )
  }

  function handlePasswordInvalid(event) {
    event.preventDefault()
    setError((currentError) =>
      currentError === 'auth.login.validation.emailRequired' ||
      currentError === 'auth.login.validation.emailInvalid'
        ? currentError
        : 'auth.login.validation.passwordRequired',
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    clearAuthError()

    try {
      await login(email, password)
    } catch (loginError) {
      setError(
        loginError instanceof ApiError
          ? loginError.message
          : loginError.message || 'auth.login.error',
      )
    } finally {
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
          <section aria-labelledby="login-title" className="shared-auth-card">
            <LanguageToggle />
            <span className="shared-auth-kicker">
              {t('auth.login.eyebrow')}
            </span>
            <h1 id="login-title">{t('auth.login.title')}</h1>
            <p className="shared-auth-description">
              {t('auth.login.description')}
            </p>

            {registrationSuccess && (
              <div className="shared-auth-success" role="status">
                {t('auth.login.registrationSuccess')}
              </div>
            )}

            {(error || authError) && (
              <div className="shared-auth-error" role="alert">
                {displayError(error || authError)}
              </div>
            )}

            <form className="shared-auth-form" onSubmit={handleSubmit}>
              <label>
                {t('auth.login.email')}
                <input
                  autoComplete="username"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    clearValidationError()
                  }}
                  onInvalid={handleEmailInvalid}
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label>
                {t('auth.login.password')}
                <input
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value)
                    clearValidationError()
                  }}
                  onInvalid={handlePasswordInvalid}
                  required
                  type="password"
                  value={password}
                />
              </label>

              <button disabled={submitting} type="submit">
                {submitting
                  ? t('auth.login.submitting')
                  : t('auth.login.submit')}
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

            <p className="shared-auth-footnote">
              {t('auth.login.accessNote')}
            </p>

            <p className="shared-auth-account-link">
              {t('auth.login.newToCarCare')}{' '}
              <a
                href="/register"
                onClick={(event) => onNavigate?.(event, '/register')}
              >
                {t('auth.login.createAccount')}
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  )
}

export default LoginPage
