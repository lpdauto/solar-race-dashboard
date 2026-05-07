'use client'

import { useEffect, useState } from 'react'
import {
  defaultCarSetup,
  readStoredCarSetup,
  writeStoredCarSetup,
  type CarSetup,
} from '@/lib/energy'

const fields: Array<{
  key: keyof CarSetup
  label: string
  step: string
  suffix: string
}> = [
  { key: 'vehicleWeightLbs', label: 'Vehicle weight', step: '1', suffix: 'lb' },
  { key: 'driverCrewWeightLbs', label: 'Driver/crew weight', step: '1', suffix: 'lb' },
  { key: 'batteryKwh', label: 'Battery capacity', step: '0.001', suffix: 'kWh' },
  { key: 'nominalVoltage', label: 'Nominal voltage', step: '0.1', suffix: 'V' },
  { key: 'cruiseSpeedMph', label: 'Cruise speed', step: '0.5', suffix: 'mph' },
  { key: 'cd', label: 'Drag coefficient', step: '0.01', suffix: 'Cd' },
  { key: 'frontalAreaM2', label: 'Frontal area', step: '0.01', suffix: 'm2' },
  { key: 'rollingResistanceCoefficient', label: 'Rolling resistance', step: '0.001', suffix: 'Crr' },
  { key: 'drivetrainEfficiency', label: 'Drivetrain efficiency', step: '0.01', suffix: 'ratio' },
  { key: 'regenEfficiency', label: 'Regen efficiency', step: '0.01', suffix: 'ratio' },
  { key: 'solarWatts', label: 'Solar array', step: '10', suffix: 'W' },
  { key: 'solarDrivingHours', label: 'Solar driving hours', step: '0.25', suffix: 'hr' },
]

export default function CarSetupPanel() {
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)

  useEffect(() => {
    setCarSetup(readStoredCarSetup())
  }, [])

  function updateField(key: keyof CarSetup, value: string) {
    const nextSetup = {
      ...carSetup,
      [key]: Number(value),
    }

    setCarSetup(nextSetup)
    writeStoredCarSetup(nextSetup)
  }

  function resetSetup() {
    setCarSetup(defaultCarSetup)
    writeStoredCarSetup(defaultCarSetup)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[#ff8fcb]">
            Editable solar car model
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Values are stored locally in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={resetSetup}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Reset Defaults
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label
            key={field.key}
            className="grid gap-1 rounded-md border border-white/10 bg-black/20 p-3"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {field.label}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step={field.step}
                value={carSetup[field.key]}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-[#ff3ea5]/60"
              />
              <span className="w-10 text-right text-xs font-semibold text-slate-400">
                {field.suffix}
              </span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}


