import { notFound, redirect } from 'next/navigation'
import { getRaceDay, raceRoute } from '@/data/raceRoute'

type DayPageProps = {
  params: Promise<{
    day: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function generateStaticParams() {
  return raceRoute.map((raceDay) => ({
    day: String(raceDay.day),
  }))
}

export async function generateMetadata({ params }: DayPageProps) {
  const { day } = await params
  const raceDay = getRaceDay(day)

  if (!raceDay) {
    return {
      title: 'Route Day Not Found',
    }
  }

  return {
    title: `Day ${raceDay.day}: ${raceDay.start} to ${raceDay.end}`,
  }
}

export default async function LegacyDayRedirectPage({
  params,
  searchParams,
}: DayPageProps) {
  const { day } = await params
  const raceDay = getRaceDay(day)

  if (!raceDay) {
    notFound()
  }

  const resolvedSearchParams = await searchParams
  const role = legacyRoleFromSearchParams(resolvedSearchParams)
  const nextSearchParams = new URLSearchParams()
  const node = firstSearchParam(resolvedSearchParams.node)

  if (role === 'vehicle-systems' && node) {
    nextSearchParams.set('node', node)
  }

  const query = nextSearchParams.toString()

  redirect(`/day/${raceDay.day}/${role}${query ? `?${query}` : ''}`)
}

function legacyRoleFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
) {
  const view = firstSearchParam(searchParams.view)
  const role = firstSearchParam(searchParams.role)

  if (view === 'race-day') return 'navigation'
  if (view === 'telemetry') return 'vehicle-systems'
  if (view === 'setup' || view === 'reports') return 'operations'
  if (
    view === 'mission-control' &&
    (role === 'race-captain' ||
      role === 'strategy' ||
      role === 'navigation' ||
      role === 'vehicle-systems' ||
      role === 'operations')
  ) {
    return role
  }

  return 'race-captain'
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
