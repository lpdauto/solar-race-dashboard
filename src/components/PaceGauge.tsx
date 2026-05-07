'use client'

type PaceGaugeProps = {
  currentSpeedMph: number
  recommendedSpeedMph: number
  status: 'GOOD' | 'SLIGHTLY FAST' | 'TOO FAST' | 'TOO SLOW' | 'CONSERVE NOW' | 'THERMAL LIMIT'
}

const statusColors: Record<PaceGaugeProps['status'], string> = {
  GOOD: '#22c55e',
  'SLIGHTLY FAST': '#facc15',
  'TOO FAST': '#ef4444',
  'TOO SLOW': '#facc15',
  'CONSERVE NOW': '#ef4444',
  'THERMAL LIMIT': '#ef4444',
}

export default function PaceGauge({
  currentSpeedMph,
  recommendedSpeedMph,
  status,
}: PaceGaugeProps) {
  const minSpeed = 10
  const maxSpeed = 45
  const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, currentSpeedMph))
  const targetSpeed = Math.max(minSpeed, Math.min(maxSpeed, recommendedSpeedMph))
  const speedRatio = (clampedSpeed - minSpeed) / (maxSpeed - minSpeed)
  const targetRatio = (targetSpeed - minSpeed) / (maxSpeed - minSpeed)
  const arcLength = 251.2
  const dashOffset = arcLength * (1 - speedRatio)
  const needleAngle = -120 + speedRatio * 240
  const targetAngle = -120 + targetRatio * 240
  const color = statusColors[status]

  return (
    <div className="relative mx-auto aspect-[1.45/1] w-full max-w-[520px]">
      <svg
        viewBox="0 0 320 220"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={`Current speed ${currentSpeedMph.toFixed(1)} miles per hour, recommended ${recommendedSpeedMph} miles per hour`}
      >
        <path
          d="M 48 170 A 112 112 0 0 1 272 170"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeLinecap="round"
          strokeWidth="22"
        />
        <path
          d="M 48 170 A 112 112 0 0 1 272 170"
          fill="none"
          stroke="url(#paceZones)"
          strokeLinecap="round"
          strokeWidth="12"
          opacity="0.75"
        />
        <path
          d="M 48 170 A 112 112 0 0 1 272 170"
          fill="none"
          stroke={color}
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="22"
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
        />
        <g
          className="transition-transform duration-700 ease-out"
          style={{
            transform: `rotate(${targetAngle}deg)`,
            transformOrigin: '160px 170px',
          }}
        >
          <line
            x1="160"
            y1="170"
            x2="160"
            y2="58"
            stroke="#ff8fcb"
            strokeDasharray="5 5"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </g>
        <g
          className="transition-transform duration-700 ease-out"
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: '160px 170px',
          }}
        >
          <line
            x1="160"
            y1="170"
            x2="160"
            y2="72"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth="7"
          />
          <line
            x1="160"
            y1="170"
            x2="160"
            y2="82"
            stroke={color}
            strokeLinecap="round"
            strokeWidth="3"
          />
        </g>
        <circle cx="160" cy="170" r="13" fill="#0b0b0b" stroke={color} strokeWidth="5" />
        <text x="48" y="205" fill="#a8a8a8" fontSize="14" fontWeight="700">
          10
        </text>
        <text x="254" y="205" fill="#a8a8a8" fontSize="14" fontWeight="700">
          45
        </text>
        <text x="160" y="126" fill="#ffffff" fontSize="46" fontWeight="900" textAnchor="middle">
          {currentSpeedMph.toFixed(0)}
        </text>
        <text x="160" y="151" fill="#cfcfcf" fontSize="14" fontWeight="800" textAnchor="middle">
          MPH
        </text>
        <defs>
          <linearGradient id="paceZones" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="28%" stopColor="#facc15" />
            <stop offset="50%" stopColor="#22c55e" />
            <stop offset="72%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
