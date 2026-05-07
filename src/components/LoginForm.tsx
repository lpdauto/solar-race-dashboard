'use client'

import { useState } from 'react'

export default function LoginForm() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string
        } | null

        setError(data?.error ?? 'Invalid password.')
        setLoading(false)
        return
      }

      window.location.href = '/'
    } catch {
      setError('Login failed. Check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-slate-300">
          Shared team password
        </span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          className="h-12 rounded-md border border-white/10 bg-slate-950 px-3 text-base font-semibold text-white outline-none transition focus:border-[#ff3ea5]/60"
          placeholder="Enter password"
        />
      </label>

      {error ? (
        <div className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm leading-6 text-[#ff8fcb]">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading || password.trim().length === 0}
        className="h-12 rounded-md bg-[#ff3ea5] px-4 text-sm font-black text-slate-950 transition hover:bg-[#ff2f9f] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Checking...' : 'Unlock Dashboard'}
      </button>
    </form>
  )
}


