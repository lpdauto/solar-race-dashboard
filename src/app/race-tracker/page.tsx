import type { Metadata } from 'next'
import RaceTrackerClient from './RaceTrackerClient'

export const metadata: Metadata = {
  title: 'RX2 Live Race Tracker',
  description: 'Public-safe live race tracker for RX2 solar racing.',
}

export default function RaceTrackerPage() {
  return <RaceTrackerClient />
}
