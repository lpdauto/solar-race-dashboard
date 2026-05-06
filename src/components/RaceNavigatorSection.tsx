'use client'

import { useMemo, useState } from 'react'
import GpsStatusPanel from '@/components/GpsStatusPanel'
import PredictiveStrategyPanel from '@/components/PredictiveStrategyPanel'
import RaceNavigator from '@/components/RaceNavigator'
import TelemetryDashboard from '@/components/TelemetryDashboard'
import WeatherWindPanel from '@/components/WeatherWindPanel'
import type { RaceDay } from '@/data/raceRoute'
import { useTelemetry } from '@/hooks/useTelemetry'

type RaceNavigatorSectionProps = {
  raceDay: RaceDay
}

export default function RaceNavigatorSection({
  raceDay,
}: RaceNavigatorSectionProps) {
  const [currentMile, setCurrentMile] = useState(0)
  const [manualMode, setManualMode] = useState(true)
  const currentSegment = useMemo(() => {
    const sortedSegments = [...raceDay.segments].sort(
      (a, b) => a.mileStart - b.mileStart
    )

    return (
      sortedSegments.find(
        (segment) =>
          currentMile >= segment.mileStart && currentMile <= segment.mileEnd
      ) ?? sortedSegments[sortedSegments.length - 1]
    )
  }, [currentMile, raceDay.segments])
  const telemetryController = useTelemetry({
    currentMile,
    currentSegment,
  })

  function handleManualMileChange(mile: number) {
    setManualMode(true)
    setCurrentMile(mile)
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
        <h3 className="text-base font-bold text-white">GPS Assist</h3>
        <div className="mt-4">
          <GpsStatusPanel
            routePoints={raceDay.routePoints}
            onMileUpdate={setCurrentMile}
            manualMode={manualMode}
            setManualMode={setManualMode}
          />
        </div>
      </section>

      <RaceNavigator
        raceDay={raceDay}
        currentMileExternal={currentMile}
        onCurrentMileChange={handleManualMileChange}
      />

      <TelemetryDashboard
        telemetry={telemetryController.telemetry}
        status={telemetryController.status}
        source={telemetryController.source}
        connect={telemetryController.connect}
        disconnect={telemetryController.disconnect}
        setSource={telemetryController.setSource}
      />

      <PredictiveStrategyPanel
        raceDay={raceDay}
        currentMile={currentMile}
        currentSegment={currentSegment}
        telemetry={telemetryController.telemetry}
      />

      <WeatherWindPanel
        dayNumber={raceDay.day}
        routePoints={raceDay.routePoints}
        currentMile={currentMile}
        currentRaceSpeedMph={telemetryController.telemetry?.speedMph}
      />
    </div>
  )
}
