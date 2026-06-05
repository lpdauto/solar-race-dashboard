import { NextResponse } from 'next/server'
import type { AiRaceEngineerInput } from '@/lib/aiRaceEngineer'

const MAX_REQUESTS_PER_MINUTE = 3
const MAX_REQUESTS_PER_DAY = 100
const minuteWindowMs = 60_000
const dayWindowMs = 24 * 60 * 60 * 1000

type BudgetEntry = {
  minuteRequests: number[]
  dailyRequests: number[]
}

// Local/dev safeguard only. Production should use durable storage such as
// Redis, a database, or platform KV, keyed by authenticated user/team identity.
// Real auth/user identity must replace appProfile before production AI access.
const requestBudgets = new Map<string, BudgetEntry>()

export function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  )
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<AiRaceEngineerInput> | null

  if (!body) {
    return NextResponse.json(
      { error: 'Malformed JSON request body.' },
      { status: 400 }
    )
  }

  const validationError = validateRaceEngineerRequest(body)

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  if (body.appProfile !== 'owner') {
    return NextResponse.json(
      { error: 'AI Race Engineer is only available in Owner Mode.' },
      { status: 403 }
    )
  }

  const budgetResult = checkOwnerBudget(body.appProfile)

  if (!budgetResult.allowed) {
    return NextResponse.json(
      {
        error: budgetResult.error,
        remainingMinuteRequests: budgetResult.remainingMinuteRequests,
        remainingDailyRequests: budgetResult.remainingDailyRequests,
      },
      { status: 429 }
    )
  }

  // TODO: replace this stub with a protected provider call after adding
  // authentication, server-side API key storage, request budgets, and rate limits.
  return NextResponse.json({
    available: false,
    source: 'online-ai',
    summary: 'Online AI route is configured but provider integration is not enabled yet.',
    recommendation:
      'Using offline deterministic strategy until API integration is enabled.',
    cautions: ['No AI provider key configured.'],
    aiAllowed: true,
    remainingMinuteRequests: budgetResult.remainingMinuteRequests,
    remainingDailyRequests: budgetResult.remainingDailyRequests,
  })
}

function validateRaceEngineerRequest(body: Partial<AiRaceEngineerInput>) {
  if (!body.appProfile) return 'Missing required field: appProfile.'
  if (body.appProfile !== 'owner' && body.appProfile !== 'team') {
    return 'Invalid appProfile.'
  }
  if (!isFiniteNumber(body.currentDay)) return 'Missing required field: currentDay.'
  if (!isFiniteNumber(body.currentMile)) return 'Missing required field: currentMile.'
  if (body.telemetry === undefined) return 'Missing required field: telemetry.'
  if (!body.strategy) return 'Missing required field: strategy.'
  if (!body.swapAdvice) return 'Missing required field: swapAdvice.'

  return null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function checkOwnerBudget(appProfile: AiRaceEngineerInput['appProfile']) {
  const key = `profile:${appProfile}`
  const now = Date.now()
  const currentBudget = requestBudgets.get(key) ?? {
    minuteRequests: [],
    dailyRequests: [],
  }
  const minuteRequests = currentBudget.minuteRequests.filter(
    (timestamp) => now - timestamp < minuteWindowMs
  )
  const dailyRequests = currentBudget.dailyRequests.filter(
    (timestamp) => now - timestamp < dayWindowMs
  )

  if (minuteRequests.length >= MAX_REQUESTS_PER_MINUTE) {
    requestBudgets.set(key, { minuteRequests, dailyRequests })

    return {
      allowed: false,
      error:
        'AI Race Engineer minute budget exceeded. Try again in about one minute.',
      remainingMinuteRequests: 0,
      remainingDailyRequests: Math.max(
        0,
        MAX_REQUESTS_PER_DAY - dailyRequests.length
      ),
    }
  }

  if (dailyRequests.length >= MAX_REQUESTS_PER_DAY) {
    requestBudgets.set(key, { minuteRequests, dailyRequests })

    return {
      allowed: false,
      error: 'AI Race Engineer daily budget exceeded. Try again tomorrow.',
      remainingMinuteRequests: Math.max(
        0,
        MAX_REQUESTS_PER_MINUTE - minuteRequests.length
      ),
      remainingDailyRequests: 0,
    }
  }

  const nextMinuteRequests = [...minuteRequests, now]
  const nextDailyRequests = [...dailyRequests, now]

  requestBudgets.set(key, {
    minuteRequests: nextMinuteRequests,
    dailyRequests: nextDailyRequests,
  })

  return {
    allowed: true,
    remainingMinuteRequests: Math.max(
      0,
      MAX_REQUESTS_PER_MINUTE - nextMinuteRequests.length
    ),
    remainingDailyRequests: Math.max(
      0,
      MAX_REQUESTS_PER_DAY - nextDailyRequests.length
    ),
  }
}
