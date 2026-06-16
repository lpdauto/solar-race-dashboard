import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import DayCommandCenter from '@/components/DayCommandCenter'
import { getRaceDay, raceRoute } from '@/data/raceRoute'

type DayRole =
  | 'race-captain'
  | 'strategy'
  | 'navigation'
  | 'vehicle-systems'
  | 'operations'

type DayRolePageProps = {
  params: Promise<{
    day: string
    role: string
  }>
}

const dayRoles: DayRole[] = [
  'race-captain',
  'strategy',
  'navigation',
  'vehicle-systems',
  'operations',
]

export function generateStaticParams() {
  return raceRoute.flatMap((raceDay) =>
    dayRoles.map((role) => ({
      day: String(raceDay.day),
      role,
    }))
  )
}

export async function generateMetadata({ params }: DayRolePageProps) {
  const { day, role } = await params
  const raceDay = getRaceDay(day)

  if (!raceDay || !isDayRole(role)) {
    return {
      title: 'Route Day Not Found',
    }
  }

  return {
    title: `Day ${raceDay.day}: ${roleLabel(role)}`,
  }
}

export default async function DayRolePage({ params }: DayRolePageProps) {
  const { day, role } = await params
  const raceDay = getRaceDay(day)

  if (!raceDay || !isDayRole(role)) {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <DayCommandCenter raceDay={raceDay} initialRole={role} />
    </Suspense>
  )
}

function isDayRole(role: string): role is DayRole {
  return dayRoles.includes(role as DayRole)
}

function roleLabel(role: DayRole) {
  if (role === 'race-captain') return 'Race Captain'
  if (role === 'vehicle-systems') return 'Vehicle Systems'

  return role.charAt(0).toUpperCase() + role.slice(1)
}
