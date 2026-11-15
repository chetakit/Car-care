import { Armchair, CarFront, Droplets, Settings, Shield, Sparkles, Wrench } from 'lucide-react'

const serviceIcons = new Map([
  ['basic wash', <Droplets />],
  ['engine cleaning', <Settings />],
  ['interior cleaning', <Armchair />],
  ['polishing', <Sparkles />],
  ['premium wash', <CarFront />],
  ['waxing', <Shield />],
])

function ServiceIcon({ name }) {
  const normalizedName = typeof name === 'string'
    ? name.trim().replace(/\s+/g, ' ').toLowerCase()
    : ''
  return (
    <span aria-hidden="true" className="customer-service-icon">
      {serviceIcons.get(normalizedName) || <Wrench />}
    </span>
  )
}

export default ServiceIcon
