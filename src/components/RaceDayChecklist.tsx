'use client'

import { useEffect, useMemo, useState } from 'react'

const checklistStorageKey = 'solar-race-day-checklist'

const checklistItems = [
  'Open dashboard on all tablets',
  'Confirm offline cache readiness',
  'Confirm GPS permission',
  'Confirm manual mode works',
  'Confirm telemetry simulator/real source works',
  'Confirm battery capacity settings',
  'Confirm car setup settings',
  'Confirm route day selected',
  'Confirm charger/solar plan',
  'Confirm chase team devices charged',
]

type ChecklistState = Record<string, boolean>

export default function RaceDayChecklist() {
  const [checkedItems, setCheckedItems] = useState<ChecklistState>({})
  const completedCount = useMemo(
    () => checklistItems.filter((item) => checkedItems[item]).length,
    [checkedItems]
  )

  useEffect(() => {
    setCheckedItems(readChecklist())

    function handleImportedBackup() {
      setCheckedItems(readChecklist())
    }

    window.addEventListener(
      'solar-race-local-backup-imported',
      handleImportedBackup
    )

    return () => {
      window.removeEventListener(
        'solar-race-local-backup-imported',
        handleImportedBackup
      )
    }
  }, [])

  function updateItem(item: string, checked: boolean) {
    const nextState = {
      ...checkedItems,
      [item]: checked,
    }

    setCheckedItems(nextState)
    window.localStorage.setItem(checklistStorageKey, JSON.stringify(nextState))
  }

  function resetChecklist() {
    setCheckedItems({})
    window.localStorage.removeItem(checklistStorageKey)
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-bold text-white">Race-Day Checklist</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {completedCount} of {checklistItems.length} setup checks complete.
          </p>
        </div>
        <button
          type="button"
          onClick={resetChecklist}
          className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-teal-300/40 hover:bg-white/10"
        >
          Reset checklist
        </button>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-teal-300 transition-all"
          style={{
            width: `${(completedCount / checklistItems.length) * 100}%`,
          }}
        />
      </div>

      <div className="mt-4 grid gap-2">
        {checklistItems.map((item) => (
          <label
            key={item}
            className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 p-3 text-sm font-semibold text-slate-200"
          >
            <input
              type="checkbox"
              checked={Boolean(checkedItems[item])}
              onChange={(event) => updateItem(item, event.target.checked)}
              className="h-5 w-5 accent-teal-300"
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

function readChecklist(): ChecklistState {
  try {
    const stored = window.localStorage.getItem(checklistStorageKey)

    if (!stored) {
      return {}
    }

    return JSON.parse(stored) as ChecklistState
  } catch {
    return {}
  }
}
