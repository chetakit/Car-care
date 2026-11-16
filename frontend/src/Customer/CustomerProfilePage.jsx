import { useEffect, useMemo, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import CustomerFooter from './CustomerFooter.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import './customer.css'
import './profile.css'

function isProfileResponse(user) {
  return (
    user &&
    typeof user.full_name === 'string' &&
    (user.phone === null || typeof user.phone === 'string')
  )
}

function CustomerProfilePage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileState, setProfileState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    api('/api/customer/profile', { signal: controller.signal })
      .then((response) => {
        const nextProfile = response.data?.user
        if (!isProfileResponse(nextProfile)) {
          throw new Error('The profile response is incomplete.')
        }
        setProfile(nextProfile)
        setFullName(nextProfile.full_name)
        setPhone(nextProfile.phone ?? '')
        setProfileState('ready')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setLoadError('We couldn’t load your profile. Check your connection and try again.')
        setProfileState('error')
      })

    return () => controller.abort()
  }, [api, reload])

  async function saveProfile(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    setNotice('')

    try {
      const response = await api('/api/customer/profile', {
        method: 'PATCH',
        body: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
        },
      })
      const nextProfile = response.data?.user
      if (!isProfileResponse(nextProfile)) {
        throw new Error('The profile response is incomplete.')
      }
      setProfile(nextProfile)
      setFullName(nextProfile.full_name)
      setPhone(nextProfile.phone ?? '')
      setNotice('Your profile has been saved.')
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : error.message || 'Unable to save your profile. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="customer-home customer-profile-page">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="profile-main">
        <div className="customer-container">
          <nav aria-label="Breadcrumb" className="profile-breadcrumb">
            <a href="/customer">Home</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">My Profile</span>
          </nav>

          <header className="profile-heading">
            <span className="customer-eyebrow">YOUR ACCOUNT</span>
            <h1>My Profile</h1>
            <p>Review and update your contact details.</p>
          </header>

          {profileState === 'loading' && (
            <div aria-live="polite" className="profile-state">
              <span className="customer-loader" />
              Loading your profile…
            </div>
          )}

          {profileState === 'error' && (
            <div className="profile-state profile-error" role="alert">
              <p>{loadError}</p>
              <button
                onClick={() => {
                  setProfileState('loading')
                  setReload((current) => current + 1)
                }}
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {profileState === 'ready' && profile && (
            <section aria-labelledby="profile-form-title" className="profile-card">
              <div className="profile-card-heading">
                <h2 id="profile-form-title">Personal details</h2>
                <p>Only your name and phone number can be changed here.</p>
              </div>

              {notice && (
                <p className="profile-notice" role="status">{notice}</p>
              )}
              {saveError && (
                <p className="profile-error" role="alert">{saveError}</p>
              )}

              <form className="profile-form" onSubmit={saveProfile}>
                <label className="profile-field">
                  <span>Full name</span>
                  <input
                    autoComplete="name"
                    maxLength={100}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    value={fullName}
                  />
                </label>

                <label className="profile-field">
                  <span>Email address</span>
                  <input
                    autoComplete="email"
                    readOnly
                    value={profile.email || ''}
                  />
                </label>

                <label className="profile-field">
                  <span>Phone number</span>
                  <input
                    autoComplete="tel"
                    maxLength={20}
                    onChange={(event) => setPhone(event.target.value)}
                    value={phone}
                  />
                </label>

                <div className="profile-actions">
                  <button
                    className="customer-button customer-button-primary"
                    disabled={saving}
                    type="submit"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default CustomerProfilePage
