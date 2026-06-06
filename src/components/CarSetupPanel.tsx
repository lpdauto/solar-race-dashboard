'use client'

import { useEffect, useState } from 'react'
import {
  OWNER_MODE_PIN_CONFIGURED,
  verifyOwnerModePin,
} from '@/lib/appAccess'
import {
  defaultCarSetup,
  readStoredCarSetup,
  writeStoredCarSetup,
  type CarSetup,
} from '@/lib/energy'

type NumericCarSetupKey = Exclude<keyof CarSetup, 'appProfile'>

const fields: Array<{
  key: NumericCarSetupKey
  label: string
  step: string
  suffix: string
  max?: string
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
  { key: 'spareBatterySocPercent', label: 'Spare Battery SOC', step: '1', suffix: '%', max: '100' },
]

export default function CarSetupPanel() {
  const [carSetup, setCarSetup] = useState<CarSetup>(defaultCarSetup)
  const [pendingOwnerMode, setPendingOwnerMode] = useState(false)
  const [ownerPin, setOwnerPin] = useState('')
  const [ownerPinError, setOwnerPinError] = useState('')

  useEffect(() => {
    setCarSetup(readStoredCarSetup())
  }, [])

  function updateField(key: NumericCarSetupKey, value: string) {
    const nextSetup = {
      ...carSetup,
      [key]: Number(value),
    }

    setCarSetup(nextSetup)
    writeStoredCarSetup(nextSetup)
  }

  function updateAppProfile(appProfile: CarSetup['appProfile']) {
    if (appProfile === 'owner') {
      setPendingOwnerMode(true)
      setOwnerPin('')
      setOwnerPinError('')
      return
    }

    const nextSetup = {
      ...carSetup,
      appProfile,
    }

    setPendingOwnerMode(false)
    setOwnerPin('')
    setOwnerPinError('')
    setCarSetup(nextSetup)
    writeStoredCarSetup(nextSetup)
  }

  function unlockOwnerMode() {
    if (!verifyOwnerModePin(ownerPin)) {
      const nextSetup = {
        ...carSetup,
        appProfile: 'team' as const,
      }

      setCarSetup(nextSetup)
      writeStoredCarSetup(nextSetup)
      setOwnerPin('')
      setOwnerPinError('Incorrect Owner Mode PIN. Team Mode remains active.')
      return
    }

    const nextSetup = {
      ...carSetup,
      appProfile: 'owner' as const,
    }

    setPendingOwnerMode(false)
    setOwnerPin('')
    setOwnerPinError('')
    setCarSetup(nextSetup)
    writeStoredCarSetup(nextSetup)
  }

  function resetSetup() {
    setCarSetup(defaultCarSetup)
    writeStoredCarSetup(defaultCarSetup)
    setPendingOwnerMode(false)
    setOwnerPin('')
    setOwnerPinError('')
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
                max={field.max}
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

      <label className="grid gap-1 rounded-md border border-white/10 bg-black/20 p-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          App Profile
        </span>
        <select
          value={carSetup.appProfile}
          onChange={(event) =>
            updateAppProfile(event.target.value as CarSetup['appProfile'])
          }
          className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-[#ff3ea5]/60"
        >
          <option value="team">Team Mode - AI disabled</option>
          <option value="owner">Owner Mode - AI enabled</option>
        </select>
        {pendingOwnerMode ? (
          <div className="mt-2 grid gap-2 rounded-md border border-violet-300/25 bg-violet-300/10 p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-100">
              Owner PIN
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={ownerPin}
                onChange={(event) => {
                  setOwnerPin(event.target.value)
                  setOwnerPinError('')
                }}
                className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-[#ff3ea5]/60"
                placeholder="Enter Owner Mode PIN"
              />
              <button
                type="button"
                onClick={unlockOwnerMode}
                className="h-10 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
              >
                Unlock
              </button>
            </div>
            <p className="text-xs leading-5 text-slate-300">
              Local safeguard only. Production needs real authentication.
            </p>
            {!OWNER_MODE_PIN_CONFIGURED ? (
              <p className="text-xs font-semibold leading-5 text-yellow-100">
                Owner PIN is using the default placeholder. Set NEXT_PUBLIC_OWNER_MODE_PIN before race use.
              </p>
            ) : null}
          </div>
        ) : null}
        {ownerPinError ? (
          <p className="mt-2 text-sm font-semibold text-[#ff8fcb]">
            {ownerPinError}
          </p>
        ) : null}
      </label>
    </div>
  )
}


