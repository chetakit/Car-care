import { useRef, useState } from 'react'
import { ApiError, apiRequest } from '../Admin/api/client.js'
import './auth.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9]{10}$/

function getRegistrationError({ fullName, email, password, phone }) {
  const normalizedName = fullName.trim()
  const normalizedEmail = email.trim()
  const passwordLength = Array.from(password).length

  if (!normalizedName || !normalizedEmail || passwordLength === 0) {
    return 'Full name, email, and password are required.'
  }
  if (
    Array.from(normalizedName).length > 100 ||
    normalizedEmail.length > 150 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    return 'Provide a valid name and email address.'
  }
  if (password.length > 1024) {
    return 'Password must be 1024 characters or fewer.'
  }
  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    return 'Phone must contain exactly 10 digits.'
  }
  return ''
}

function RegistrationPage({ onNavigate }) {
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
        throw new Error('The registration response did not include the created customer account.')
      }

      const currentState = window.history.state
      window.history.replaceState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
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
          : registrationError.message || 'Unable to create your account. Please try again.',
      )
    } finally {
      submissionInProgress.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="shared-auth-page">
      <section aria-labelledby="registration-title" className="shared-auth-card">
        <div className="shared-auth-brand">
          <span className="shared-auth-brand-mark">C</span>
          <span>
            <strong>Car Care</strong>
            <small>CREATE YOUR ACCOUNT</small>
          </span>
        </div>
        <h1 id="registration-title">Create your account</h1>
        <p className="shared-auth-description">
          Register for a Customer account to book and manage car care services.
        </p>
        {error && (
          <div className="shared-auth-error" role="alert">
            {error}
          </div>
        )}
        <form className="shared-auth-form" noValidate onSubmit={handleSubmit}>
          <label>
            Full name
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
            Email address
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
            Phone (optional)
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
          <label>
            Password
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
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p className="shared-auth-account-link">
          Already have an account?{' '}
          <a href="/login" onClick={(event) => onNavigate?.(event, '/login')}>
            Sign in
          </a>
        </p>
      </section>
    </main>
  )
}

export default RegistrationPage
