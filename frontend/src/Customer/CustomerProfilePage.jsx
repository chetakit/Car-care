import { useEffect, useMemo, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
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
  const { t } = useLanguage()
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
        setLoadError('customer.profile.loadError')
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
      setNotice('customer.profile.saved')
    } catch {
      setSaveError('customer.profile.saveError')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="customer-home customer-profile-page">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="profile-main">
        <div className="customer-container">
          <nav
            aria-label={t('customer.profile.breadcrumbLabel')}
            className="profile-breadcrumb"
          >
            <a href="/customer">{t('customer.profile.breadcrumb')}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t('customer.profile.title')}</span>
          </nav>

          <header className="profile-heading">
            <span className="customer-eyebrow">{t('customer.profile.eyebrow')}</span>
            <h1>{t('customer.profile.title')}</h1>
            <p>{t('customer.profile.description')}</p>
          </header>

          {profileState === 'loading' && (
            <div aria-live="polite" className="profile-state">
              <span className="customer-loader" />
              {t('customer.profile.loading')}
            </div>
          )}

          {profileState === 'error' && (
            <div className="profile-state profile-error" role="alert">
              <p>{t(loadError)}</p>
              <button
                onClick={() => {
                  setProfileState('loading')
                  setReload((current) => current + 1)
                }}
                type="button"
              >
                {t('customer.common.retry')}
              </button>
            </div>
          )}

          {profileState === 'ready' && profile && (
            <section aria-labelledby="profile-form-title" className="profile-card">
              <div className="profile-card-heading">
                <h2 id="profile-form-title">{t('customer.profile.details')}</h2>
                <p>{t('customer.profile.editNotice')}</p>
              </div>

              {notice && (
                <p className="profile-notice" role="status">{t(notice)}</p>
              )}
              {saveError && (
                <p className="profile-error" role="alert">
                  {saveError === 'customer.profile.saveError' ? t(saveError) : saveError}
                </p>
              )}

              <form className="profile-form" onSubmit={saveProfile}>
                <label className="profile-field">
                  <span>{t('customer.profile.fullName')}</span>
                  <input
                    autoComplete="name"
                    maxLength={100}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    value={fullName}
                  />
                </label>

                <label className="profile-field">
                  <span>{t('customer.profile.email')}</span>
                  <input
                    autoComplete="email"
                    readOnly
                    value={profile.email || ''}
                  />
                </label>

                <label className="profile-field">
                  <span>{t('customer.profile.phone')}</span>
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
                    {saving
                      ? t('customer.common.saving')
                      : t('customer.profile.saveChanges')}
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
