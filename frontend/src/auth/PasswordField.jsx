import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext.jsx'

// Password input with a show/hide button.
function PasswordField({ label, ...inputProps }) {
  const { t } = useLanguage()
  const [shown, setShown] = useState(false)
  const toggleLabel = t(shown ? 'auth.password.hide' : 'auth.password.show')

  return (
    <label>
      {label}
      <span className="garage-password">
        <input {...inputProps} type={shown ? 'text' : 'password'} />
        <button
          aria-label={toggleLabel}
          aria-pressed={shown}
          className="garage-password-toggle"
          onClick={() => setShown((value) => !value)}
          title={toggleLabel}
          type="button"
        >
          {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
    </label>
  )
}

export default PasswordField
