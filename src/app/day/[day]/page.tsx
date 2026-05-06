import Link from 'next/link'
import { notFound } from 'next/navigation'
import DayCommandCenter from '@/components/DayCommandCenter'
import {
  getRaceDay,
  raceRoute,
} from '@/data/raceRoute'

type DayPageProps = {
  params: Promise<{
    day: string
  }>
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

export default async function DayDetailPage({ params }: DayPageProps) {
  const { day } = await params
  const raceDay = getRaceDay(day)

  if (!raceDay) {
    notFound()
  }

  return <DayCommandCenter raceDay={raceDay} />
}
