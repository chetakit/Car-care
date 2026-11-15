import { useState } from 'react'
import { ApiError } from '../Admin/api/client.js'
import useAuth from './useAuth.js'
import './auth.css'

function LoginPage({ registrationSuccess = false, onNavigate }) {
  const { login, authError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
          : loginError.message || 'Unable to sign in. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="shared-auth-page">
      <section aria-labelledby="login-title" className="shared-auth-card">
        <div className="shared-auth-brand">
          <span className="shared-auth-brand-mark">C</span>
          <span>
            <strong>Car Care</strong>
            <small>SECURE ACCESS</small>
          </span>
        </div>
        <h1 id="login-title">Welcome back</h1>
        <p className="shared-auth-description">
          Sign in with your Car Care account to continue.
        </p>
        {registrationSuccess && (
          <div className="shared-auth-success" role="status">
            Your account has been created. You can sign in now.
          </div>
        )}
        {(error || authError) && (
          <div className="shared-auth-error" role="alert">
            {error || authError}
          </div>
        )}
        <form className="shared-auth-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </form>
        <p className="shared-auth-footnote">
          Your account role determines which Car Care workspace you can access.
        </p>
        <p className="shared-auth-account-link">
          New to Car Care?{' '}
          <a href="/register" onClick={(event) => onNavigate?.(event, '/register')}>
            Create Account
          </a>
        </p>
      </section>
    </main>
  )
}

export default LoginPage
