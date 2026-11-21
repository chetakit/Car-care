import { useState } from 'react'
import { ApiError } from '../Admin/api/client.js'
import useAuth from './useAuth.js'
import PasswordField from './PasswordField.jsx'
import { useLanguage } from '../i18n/LanguageContext.jsx'

// Sign-in form shown in the garage's headlight.
// onFail: the sign-in was rejected (the car stalls).
// beforeCommit: awaited after the server accepts, before the session is
//   saved and the app navigates away (the car drives off).
function LoginForm({ registrationSuccess = false, onSwitch, onFail, beforeCommit }) {
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
    onFail?.()
  }

  function handlePasswordInvalid(event) {
    event.preventDefault()
    setError((currentError) =>
      currentError === 'auth.login.validation.emailRequired' ||
      currentError === 'auth.login.validation.emailInvalid'
        ? currentError
        : 'auth.login.validation.passwordRequired',
    )
    onFail?.()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    clearAuthError()

    try {
      await login(email, password, { beforeCommit })
    } catch (loginError) {
      setError(
        loginError instanceof ApiError && loginError.status === 429
          ? t('auth.error.tooManyAttempts', {
              minutes: Math.max(1, Math.ceil((loginError.payload?.retry_after_seconds || 60) / 60)),
            })
          : loginError instanceof ApiError
          ? loginError.message
          : loginError.message || 'auth.login.error',
      )
      onFail?.()
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
      <span className="garage-kicker">{t('auth.login.eyebrow')}</span>
      <h1 id="garage-form-title">{t('auth.login.title')}</h1>
      <p className="garage-description">{t('auth.login.description')}</p>

      {registrationSuccess && (
        <div className="garage-success" role="status">
          {t('auth.login.registrationSuccess')}
        </div>
      )}

      {(error || authError) && (
        <div className="garage-error" role="alert">
          {displayError(error || authError)}
        </div>
      )}

      <form className="garage-form" onSubmit={handleSubmit}>
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

        <PasswordField
          autoComplete="current-password"
          label={t('auth.login.password')}
          onChange={(event) => {
            setPassword(event.target.value)
            clearValidationError()
          }}
          onInvalid={handlePasswordInvalid}
          required
          value={password}
        />

        <button className="garage-submit" disabled={submitting} type="submit">
          {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
          {!submitting && <span aria-hidden="true" className="garage-submit-arrow">→</span>}
        </button>
      </form>

      <p className="garage-footnote">{t('auth.login.accessNote')}</p>

      <p className="garage-switch">
        {t('auth.login.newToCarCare')}{' '}
        <a href="/register" onClick={(event) => onSwitch?.(event, '/register')}>
          {t('auth.login.createAccount')}
        </a>
      </p>
    </>
  )
}

export default LoginForm
