import { useEffect, useRef, useState } from 'react'
import { Code, Copyright, CreditCard, Database, GraduationCap, Mail } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import { COURSE_CODE, FACULTY, INSTRUCTOR, STACK, TEAM, UNIVERSITY } from './aboutData.js'
import { useRevealOnScroll } from './useLandingMotion.js'
import './customer.css'

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  )
}

const LICENSE_POINTS = [
  { icon: Database, key: 'customer.about.licensePoint1' },
  { icon: CreditCard, key: 'customer.about.licensePoint2' },
  { icon: Code, key: 'customer.about.licensePoint3' },
]

// Credit cards: a soft brand-coloured light follows the pointer and the card
// tilts slightly toward it. Only CSS variables change, so it stays smooth.
function moveSpotlight(event) {
  const card = event.currentTarget
  const rect = card.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  card.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`)
  card.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`)
}

function resetSpotlight(event) {
  const card = event.currentTarget
  card.style.setProperty('--rx', '0deg')
  card.style.setProperty('--ry', '0deg')
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

// Accepts "chetakit", "@chetakit" or "https://github.com/chetakit" and
// returns just the username ('' when nothing usable was given).
function githubUser(value) {
  return (value || '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
}

// Where to place the photo inside the round frame. Without photoCrop it just
// fills the circle (centred). With photoCrop { x, y, zoom } — x/y = the face
// centre as % of the photo — it zooms in and centres on that point, which is
// what a half-body portrait needs.
function photoStyle(crop, size) {
  if (!crop || !size) return undefined
  const ratio = size.width / size.height
  const zoom = Math.max(1, crop.zoom ?? 1)
  const width = (ratio < 1 ? 1 : ratio) * zoom
  const height = (ratio < 1 ? 1 / ratio : 1) * zoom
  const clamp = (value, min) => Math.min(0, Math.max(min, value))
  const left = clamp(0.5 - (crop.x / 100) * width, 1 - width)
  const top = clamp(0.5 - (crop.y / 100) * height, 1 - height)
  return {
    position: 'absolute',
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
    maxWidth: 'none',
    objectFit: 'fill',
  }
}

// Photo if one is set and loads; otherwise the initial letter.
function MemberAvatar({ member }) {
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState(null)
  if (member.photo && !failed) {
    return (
      <span className="about-avatar has-photo">
        <span className="about-avatar-frame">
          <img
            alt={member.name}
            decoding="async"
            onError={() => setFailed(true)}
            onLoad={(event) =>
              setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            src={member.photo}
            style={photoStyle(member.photoCrop, size)}
          />
        </span>
      </span>
    )
  }
  return <span aria-hidden="true" className="about-avatar">{member.initial}</span>
}

// Who built the site, under what terms, and with what.
function AboutPage({ user, onLogout }) {
  const { t } = useLanguage()
  const rootRef = useRef(null)
  useRevealOnScroll(rootRef, 'about')

  // Footer links point at /about#team, #license, #credits. The browser tries
  // to jump before React has rendered, so jump again once the page exists.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const target = document.getElementById(id)
    if (target) window.requestAnimationFrame(() => target.scrollIntoView())
  }, [])

  return (
    <div className="customer-home customer-about-page" ref={rootRef}>
      <CustomerHeader onLogout={onLogout} user={user} />
      <main>
        <section aria-labelledby="about-title" className="about-hero">
          <div className="customer-container about-hero-inner">
            <span className="about-eyebrow customer-rise" style={{ '--rise-delay': '60ms' }}>
              {t('customer.about.eyebrow', { course: COURSE_CODE })}
            </span>
            <h1 className="customer-rise" id="about-title" style={{ '--rise-delay': '160ms' }}>
              {t('customer.about.title')}
            </h1>
            <p className="customer-rise" style={{ '--rise-delay': '280ms' }}>
              {t('customer.about.description')}
            </p>
            {(UNIVERSITY || FACULTY) && (
              <p className="about-school customer-rise" style={{ '--rise-delay': '330ms' }}>
                {[FACULTY, UNIVERSITY].filter(Boolean).join(' · ')}
              </p>
            )}
            <nav
              aria-label={t('customer.about.jumpTo')}
              className="about-jump customer-rise"
              style={{ '--rise-delay': '380ms' }}
            >
              <a href="#team">{t('customer.about.teamTitle')}</a>
              <a href="#license">{t('customer.about.licenseTitle')}</a>
              <a href="#credits">{t('customer.about.creditsTitle')}</a>
            </nav>
          </div>
        </section>

        <section aria-labelledby="team" className="about-section">
          <div className="customer-container">
            <header className="about-section-head" data-reveal>
              <span className="about-kicker">01</span>
              <h2 id="team">{t('customer.about.teamTitle')}</h2>
              <p>{t('customer.about.teamNote', { count: TEAM.length })}</p>
            </header>
            <article className="about-instructor" data-reveal>
              <MemberAvatar member={INSTRUCTOR} />
              <div className="about-instructor-body">
                <span className="about-instructor-label">
                  <GraduationCap aria-hidden="true" />
                  {t('customer.about.instructor', { course: COURSE_CODE })}
                </span>
                <h3>{INSTRUCTOR.name}</h3>
                <p>{INSTRUCTOR.department}</p>
                {UNIVERSITY && <p className="about-instructor-school">{UNIVERSITY}</p>}
              </div>
              <a className="about-instructor-mail" href={`mailto:${INSTRUCTOR.email}`}>
                <Mail aria-hidden="true" />
                <span>{INSTRUCTOR.email}</span>
              </a>
            </article>
            <ul className="about-team">
              {TEAM.map((member, index) => (
                <li data-reveal key={member.id} style={{ '--reveal-delay': `${index * 90}ms` }}>
                  <article className={`about-member${member.lead ? ' is-lead' : ''}`}>
                    <MemberAvatar member={member} />
                    {member.lead && <span className="about-lead-badge">{t('customer.about.leader')}</span>}
                    <h3>{member.name}</h3>
                    <span className="about-member-id">{member.id}</span>
                    <p className="about-member-role">{member.role}</p>
                    {member.module && (
                      <div className="about-member-module">
                        <span>{t('customer.about.module')}</span>
                        <strong>{member.module}</strong>
                      </div>
                    )}
                    {member.tags?.length > 0 && (
                      <ul className="about-member-tags">
                        {member.tags.map((tag) => <li key={tag}>{tag}</li>)}
                      </ul>
                    )}
                    {githubUser(member.github) && (
                      <a
                        className="about-member-github"
                        href={`https://github.com/${githubUser(member.github)}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <GitHubIcon />
                        <span>@{githubUser(member.github)}</span>
                      </a>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="license" className="about-section about-section-alt">
          <div className="customer-container">
            <header className="about-section-head" data-reveal>
              <span className="about-kicker">02</span>
              <h2 id="license">{t('customer.about.licenseTitle')}</h2>
            </header>
            <div className="about-license" data-reveal>
              <div className="about-license-top">
                <div className="about-license-mark" aria-hidden="true">
                  <span className="about-license-ring" />
                  <Copyright />
                </div>
                <div>
                  <span className="about-license-tag">
                    <GraduationCap aria-hidden="true" />
                    {t('customer.about.licenseTag')}
                  </span>
                  <h3>{t('customer.about.licenseHeading', { year: new Date().getFullYear() })}</h3>
                  <p>{t('customer.about.licenseBody', { course: COURSE_CODE })}</p>
                </div>
              </div>
              <ul className="about-license-points">
                {LICENSE_POINTS.map(({ icon: Icon, key }, index) => (
                  <li key={key} style={{ '--point-delay': `${200 + index * 120}ms` }}>
                    <span className="about-license-point-icon"><Icon aria-hidden="true" /></span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="credits" className="about-section">
          <div className="customer-container">
            <header className="about-section-head" data-reveal>
              <span className="about-kicker">03</span>
              <h2 id="credits">{t('customer.about.creditsTitle')}</h2>
              <p>{t('customer.about.creditsNote')}</p>
            </header>
            <ul className="about-stack">
              {STACK.map(({ icon: Icon, ...item }, index) => (
                <li data-reveal key={item.name} style={{ '--reveal-delay': `${(index % 4) * 70}ms` }}>
                  <a
                    href={item.href}
                    onPointerLeave={resetSpotlight}
                    onPointerMove={moveSpotlight}
                    rel="noreferrer"
                    style={{ '--brand': item.color }}
                    target="_blank"
                  >
                    <span className="about-stack-icon"><Icon aria-hidden="true" /></span>
                    <span className="about-stack-text">
                      <span className="about-stack-part">{item.part}</span>
                      <strong>{item.name}</strong>
                      <span className="about-stack-license">{item.license}</span>
                    </span>
                    <ArrowIcon />
                  </a>
                </li>
              ))}
            </ul>
            <p className="about-photo-credit" data-reveal>
              {t('customer.about.photoCredit')}{' '}
              <a href="https://unsplash.com/license" rel="noreferrer" target="_blank">Unsplash</a>
            </p>
            <p className="about-photo-credit" data-reveal>
              {t('customer.about.soundCredit')}{' '}
              <a href="https://pixabay.com/service/license-summary/" rel="noreferrer" target="_blank">Pixabay</a>
            </p>
            <p className="about-photo-credit" data-reveal>
              {t('customer.about.modelCredit')}{' '}
              <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noreferrer" target="_blank">CC BY-NC-SA 4.0</a>
              {' · '}
              <a href="https://sketchfab.com/3d-models/2019-lamborghini-urus-9ef2fd625ba54ea39226ea5d043c0e13" rel="noreferrer" target="_blank">Sketchfab</a>
            </p>
          </div>
        </section>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default AboutPage
