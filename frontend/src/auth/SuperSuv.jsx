// Side view of a yellow super-SUV in the style of the Lamborghini Urus
// (Y-shaped lights, hexagonal arches, coupe roof, trapezoid exhausts) - no
// badges or logos, those are Lamborghini's trademarks. Facing right.
// viewBox 0 0 640 230 - headlight sits at (590, 126), exhaust at (55, 170).

function Wheel({ x }) {
  return (
    <g transform={`translate(${x} 176)`}>
      <circle className="suv-tire" r="42" />
      <circle className="suv-tire-wall" r="38" />
      <g className="suv-wheel-spin">
        <circle className="suv-rim" r="31" />
        {/* Five Y-shaped spokes. */}
        {[0, 72, 144, 216, 288].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <path className="suv-spoke" d="M-1.8 -9 L1.8 -9 L2.4 -17 L8 -28.5 L4 -29.5 L0 -20 L-4 -29.5 L-8 -28.5 L-2.4 -17 Z" />
          </g>
        ))}
        <circle className="suv-hub" r="7" />
      </g>
      <path className="suv-caliper" d="M-18 -15 A24 24 0 0 1 10 -22" />
    </g>
  )
}

function SuperSuv() {
  return (
    <svg className="suv" viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="suv-paint" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffe45c" />
          <stop offset="0.35" stopColor="#f6c000" />
          <stop offset="0.7" stopColor="#d99a00" />
          <stop offset="1" stopColor="#7a5200" />
        </linearGradient>
        <linearGradient id="suv-glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2e35" />
          <stop offset="1" stopColor="#06070a" />
        </linearGradient>
        <radialGradient id="suv-rim-paint" r="0.6">
          <stop offset="0" stopColor="#2b2e33" />
          <stop offset="1" stopColor="#0b0c0e" />
        </radialGradient>
      </defs>

      {/* Shadow on the floor. */}
      <ellipse className="suv-shadow" cx="322" cy="220" rx="300" ry="10" />

      <g className="suv-body">
        {/* Body: coupe roof falling to a short tail, tall blunt nose. */}
        <path
          className="suv-paint"
          d="M64 176 L56 150 L60 120 L78 110 L126 96 L212 68 L296 60 L350 64 L406 95 L484 104 L552 111 L588 117 L600 134 L598 168 L584 180 L534 180 L526 140 L502 124 L460 124 L436 140 L428 180 L202 180 L194 140 L170 124 L130 124 L106 140 L98 180 Z"
        />
        {/* Glass, with the pointed rear quarter window. */}
        <path className="suv-glass" d="M150 101 L214 74 L296 66 L346 69 L394 97 Z" />
        <path className="suv-pillar" d="M210 76 L226 100" />
        <path className="suv-pillar" d="M292 66 L294 99" />
        {/* Sharp shoulder line from the front arch to the tail. */}
        <path className="suv-crease" d="M92 120 L300 112 L520 118 L590 124" />
        <path className="suv-crease is-low" d="M206 152 L428 150" />
        {/* Door shut lines. */}
        <path className="suv-seam" d="M294 102 L298 170" />
        <path className="suv-seam" d="M396 100 L412 170" />
        {/* Black hexagonal arch trim and lower cladding. */}
        <path className="suv-arch" d="M98 180 L106 140 L130 124 L170 124 L194 140 L202 180" />
        <path className="suv-arch" d="M428 180 L436 140 L460 124 L502 124 L526 140 L534 180" />
        <path className="suv-trim" d="M202 180 L428 180 L425 165 L205 165 Z" />
        <path className="suv-trim" d="M534 180 L584 180 L598 168 L599 150 L578 150 L566 168 Z" />
        <path className="suv-trim" d="M98 180 L64 176 L58 158 L92 162 Z" />
        {/* Air vent behind the front wheel. */}
        <path className="suv-trim" d="M506 128 L522 136 L530 166 L516 150 Z" />
        {/* Mirror. */}
        <path className="suv-paint-edge" d="M388 100 L408 95 L411 106 L393 108 Z" />
        {/* Headlight: dark housing with a Y-shaped running light. */}
        <path className="suv-lamp" d="M546 112 L589 119 L594 131 L560 127 Z" />
        <path className="suv-drl" d="M552 116 L572 121 L590 121 M572 121 L586 129" />
        {/* Tail: Y-shaped light. */}
        <path className="suv-lamp" d="M58 118 L118 99 L121 106 L61 126 Z" />
        <path className="suv-taillight" d="M62 119 L90 110 L118 102 M90 110 L84 121" />
        {/* Trapezoid exhaust tips. */}
        <path className="suv-exhaust" d="M44 165 L66 165 L63 175 L47 175 Z" />
      </g>

      <Wheel x={150} />
      <Wheel x={481} />
    </svg>
  )
}

export default SuperSuv
