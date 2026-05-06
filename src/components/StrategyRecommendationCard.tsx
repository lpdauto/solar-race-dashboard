'use client'

import type { StrategyRecommendation } from '@/lib/strategyEngine'

type StrategyRecommendationCardProps = {
  recommendation: StrategyRecommendation
}

const severityStyles: Record<StrategyRecommendation['severity'], string> = {
  info: 'border-teal-300/30 bg-teal-300/10 text-teal-100',
  warning: 'border-yellow-300/35 bg-yellow-300/10 text-yellow-100',
  danger: 'border-red-400/35 bg-red-400/10 text-red-100',
}

export default function StrategyRecommendationCard({
  recommendation,
}: StrategyRecommendationCardProps) {
  return (
    <article
      className={`rounded-lg border p-4 ${severityStyles[recommendation.severity]}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">
        {recommendation.severity}
      </p>
      <h4 className="mt-1 text-base font-bold text-white">
        {recommendation.title}
      </h4>
      <p className="mt-2 text-sm leading-6">{recommendation.action}</p>
    </article>
  )
}
