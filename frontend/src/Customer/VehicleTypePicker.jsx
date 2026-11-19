import { useLanguage } from '../i18n/LanguageContext.jsx'

// Pill buttons for "All types" + each vehicle type. value '' = all types.
function VehicleTypePicker({ types, value, onChange, className = '', ...rest }) {
  const { t } = useLanguage()

  return (
    <div
      aria-label={t('customer.landing.priceTypeLabel')}
      className={`customer-type-picker ${className}`.trim()}
      role="radiogroup"
      {...rest}
    >
      {[{ id: '', name: t('customer.landing.priceTypeAll') }, ...types].map((type) => (
        <button
          aria-checked={value === type.id}
          className={value === type.id ? 'is-active' : undefined}
          key={type.id || 'all'}
          onClick={() => onChange(type.id)}
          role="radio"
          type="button"
        >
          {type.name}
        </button>
      ))}
    </div>
  )
}

export default VehicleTypePicker
