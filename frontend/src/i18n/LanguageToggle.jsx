import { useLanguage } from './LanguageContext.jsx'
import './language-toggle.css'

function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div aria-label={t('language.label')} className="language-toggle" role="group">
      <button
        aria-label={t('language.switchToThai')}
        aria-pressed={language === 'TH'}
        className="language-toggle__option"
        onClick={() => setLanguage('TH')}
        type="button"
      >
        TH
      </button>
      <button
        aria-label={t('language.switchToEnglish')}
        aria-pressed={language === 'EN'}
        className="language-toggle__option"
        onClick={() => setLanguage('EN')}
        type="button"
      >
        EN
      </button>
    </div>
  )
}

export default LanguageToggle
