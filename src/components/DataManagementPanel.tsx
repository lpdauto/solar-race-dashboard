'use client'

import { useRef, useState } from 'react'
import {
  downloadJsonFile,
  exportLocalStorageBackup,
  importLocalStorageBackup,
  readJsonFile,
} from '@/lib/localBackup'

type Message = {
  type: 'success' | 'error' | 'warning'
  text: string
}

export default function DataManagementPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [pendingJson, setPendingJson] = useState<unknown | null>(null)

  function exportSettings() {
    const backup = exportLocalStorageBackup()
    const date = new Date().toISOString().slice(0, 10)

    downloadJsonFile(backup, `solar-race-dashboard-backup-${date}.json`)
    setMessage({
      type: 'success',
      text: 'Local dashboard settings exported.',
    })
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) {
      return
    }

    try {
      const json = await readJsonFile(file)

      setPendingJson(json)
      setMessage({
        type: 'warning',
        text: 'Import is ready. Confirm below to replace current local settings.',
      })
    } catch (error) {
      setPendingJson(null)
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Could not prepare import file.',
      })
    }
  }

  function confirmImport() {
    if (!pendingJson) {
      return
    }

    try {
      importLocalStorageBackup(pendingJson)
      setPendingJson(null)
      setMessage({
        type: 'success',
        text: 'Local dashboard settings imported. Refresh open race-day tabs to sync all panels.',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Import failed. Check the backup file and try again.',
      })
    }
  }

  function cancelImport() {
    setPendingJson(null)
    setMessage(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
      <div>
        <h2 className="text-lg font-bold text-white">Data Management</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Export or import local app settings for tablet backup and handoff.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={exportSettings}
          className="h-11 rounded-md bg-[#ff3ea5] px-3 text-sm font-bold text-slate-950 transition hover:bg-[#ff2f9f]"
        >
          Export settings JSON
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-11 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
        >
          Select import JSON
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => handleFileSelected(event.target.files?.[0])}
        className="hidden"
      />

      <div className="mt-4 rounded-md border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm leading-6 text-yellow-100">
        Import replaces current local race settings stored in this browser,
        including car setup values, checklist state, and saved dashboard preferences.
      </div>

      {pendingJson ? (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-white/10 bg-black/20 p-3 sm:flex-row">
          <button
            type="button"
            onClick={confirmImport}
            className="h-10 rounded-md bg-yellow-300 px-3 text-sm font-bold text-slate-950 transition hover:bg-yellow-200"
          >
            Confirm import
          </button>
          <button
            type="button"
            onClick={cancelImport}
            className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-bold text-slate-100 transition hover:border-[#ff3ea5]/40 hover:bg-white/10"
          >
            Cancel import
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          className={`mt-4 rounded-md border p-3 text-sm leading-6 ${
            message.type === 'success'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
              : message.type === 'warning'
                ? 'border-yellow-300/30 bg-yellow-300/10 text-yellow-100'
                : 'border-red-400/30 bg-red-400/10 text-[#ff8fcb]'
          }`}
        >
          {message.text}
        </div>
      ) : null}
    </section>
  )
}


