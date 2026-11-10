import { useState } from 'react'
import AdminIcon from './AdminIcon.jsx'
import { ApiError } from '../api/client.js'
import useAdminAuth from '../auth/useAdminAuth.js'

function AdminLogin() {
  const { login, authError, clearAuthError } = useAdminAuth()
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
          : 'Unable to sign in. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="admin-login-page">
      <section aria-labelledby="admin-login-title" className="admin-login-card">
        <div className="admin-login-brand">
          <span className="admin-brand-mark">C</span>
          <span>
            <strong>Car Care</strong>
            <small>ADMINISTRATION</small>
          </span>
        </div>
        <p className="admin-eyebrow">SECURE WORKSPACE</p>
        <h1 id="admin-login-title">Welcome back</h1>
        <p className="admin-login-description">
          Sign in with your administrator account to continue.
        </p>
        {(error || authError) && (
          <div className="admin-alert admin-alert-error" role="alert">
            {error || authError}
          </div>
        )}
        <form className="admin-login-form" onSubmit={handleSubmit}>
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
          <button className="admin-primary-button" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
            {!submitting && <AdminIcon name="chevron" size={16} />}
          </button>
        </form>
        <p className="admin-login-footnote">
          Administrator access is verified by the Car Care backend.
        </p>
      </section>
    </main>
  )
}

export default AdminLogin
